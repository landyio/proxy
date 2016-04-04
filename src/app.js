const https = require('https')
const http = require('http')
const httpProxy = require('http-proxy')
const cluster = require('cluster')
const connect = require('connect')
const url = require('url')
const harmon = require('harmon')
const request = require('request')
const pathToRegexp = require('path-to-regexp')
const Cookies = require('cookies')
const helmet = require('helmet')


// Defining enviroment variables

const editorJs = process.env.editorJs || 'https://d2mnlxdd0x11jg.cloudfront.net/editor.min.js'
const proxyUrl = process.env.proxyUrl || 'http://proxy.landy.dev/'
const env = process.env.NODE_ENV || 'dev'
const sameOriginDomain = process.env.sameOrigin || 'landy.dev'

const userAgent = 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2228.0 Safari/537.36'


// Creating http proxy
const proxy = httpProxy.createProxyServer({})


/**
 * Compare domain and path to confirm
 * that redirect is allowed. Otherwise landy.min.js
 * would not be able to validate current url, when
 * it will be installed and apply variations
 * @param  {String} url1 Original URL
 * @param  {String} url2 Redirect URL
 * @return {Boolean}
 */
function compareUrls(url1, url2) {
  const urlObj1 = url.parse(url1)
  const urlObj2 = url.parse(url2)

  if (!urlObj1 || !urlObj2) return false

  const pathname1 = urlObj1.pathname.replace(/\/$/, '')
  const pathname2 = urlObj2.pathname.replace(/\/$/, '')

  const pathCorrect = (pathname1 === pathname2)

  const domain1 = urlObj1.hostname.replace(/^www./, '')
  const domain2 = urlObj2.hostname.replace(/^www./, '')
  const domainCorrect = (domain1 === domain2)

  return pathCorrect && domainCorrect
}


const app = connect()

/**
 * Updating HTML Dom
 */

const selects = []

/**
 * Search for full links in stylesheet and script links.
 * Replaces with relative links
 */
const hrefTags = {
  query: 'link[rel="stylesheet"], script[src]',

  func(node) {
    const stm = node.createStream({ outer: true })

    // Variable to hold all the info from the query
    let tag = ''

    // Collect all the data in the stream
    stm.on('data', (data) => {
      tag += data
    })

    // Updating head tag on the end of stream
    stm.on('end', () => {
      tag = tag.replace('http://', '/http://')
        // Removing google analytics and tag manager scripts
      stm.end(tag)
    })
  },
}

selects.push(hrefTags)


// Update head tag
const headTag = {
  query: 'head',

  func(node) {
    const stm = node.createStream()

    // Variable to hold all the info from the head tag
    let tag = ''

    // Collect all the data in the stream
    stm.on('data', (data) => {
      tag += data
    })

    // Updating head tag on the end of stream
    stm.on('end', () => {
      // Removing google analytics and tag manager scripts
      tag = tag.replace(
        /(<script.*google-analytics.*\/script>)|(<script.*googletagmanager.*\/script>)|(<noscript.*googletagmanager.*\/noscript>)/gim,
        '')

      stm.end('<script>document.domain = "' + sameOriginDomain + '";</script>' +
        '<meta name="referrer" content="origin-when-crossorigin">' +
        tag)
    })
  },
}

selects.push(headTag)

// Update body tag
const bodyTag = {
  query: 'body',

  func(node) {
    const stm = node.createStream({})
    let tag = ''

    stm.on('data', (data) => {
      tag += data
    })

    stm.on('end', () => {
      // Append editor.js to manipulate DOM
      stm.end(tag +
        '<script src="' + editorJs + '"></script>')
    })
  },
}

selects.push(bodyTag)

app.use(harmon([], selects, true))


/**
 * onRequest() parse incoming URL parameter,
 * prepares it for proxied and updates req.url
 */
function onRequest(req, res, next) {
  let urlParam
  /**
   * Validate if req.url was not encoded. This is a signal
   * of appended slash before full URL. Used for scripts and
   * stylesheets with full path on http protocol
   */
  if (req.url.indexOf('/http://') === 0) {
    urlParam = req.url.slice(1)
  }

  /**
   * Validate if path is non-full
   * and contains updates from 'campaignURL' cookie,
   * which is set on the Meteor side
   */
  const isNotFullPath = (req.url.indexOf('http') === -1)

  if (isNotFullPath) {
    const cookies = new Cookies(req, res)
    const parentUrl = decodeURIComponent(cookies.get('campaignURL'))

    if (!parentUrl) {
      res.end()
      return
    }

    urlParam = url.resolve(parentUrl, req.url)
  }


  // Parse and decode incoming url as parameter
  if (!urlParam) {
    const keys = []
    const re = pathToRegexp('/:url+', keys)
    const uri = re.exec(req.url)
    if (!uri) {
      res.end()
      return
    }

    const uriParam = uri[1]
    urlParam = decodeURIComponent(uriParam)
  }

  const requestOptions = {
    followAllRedirects: false,
    headers: {
      'User-Agent': userAgent,
    },
    uri: urlParam,
    timeout: 2000,
    strictSSL: false,
  }

  /**
   * request() checks if there is redirect
   * on proxied url and pass it to proxy
   */
  request(requestOptions, (error, response) => {
    const validRedirect = (response &&
      response.request &&
      response.request.uri &&
      response.request.uri.href !== urlParam &&
      compareUrls(response.request.uri.href, urlParam))

    if (validRedirect) urlParam = response.request.uri.href

    delete req.headers.cookies
    req.url = urlParam

    next()
  })
}

app.use(onRequest)

/**
 * Update headers to allow embedding resource
 * in iframe and cross-origin resources
 */

app.use((req, res, next) => {
  res.oldWriteHead = res.writeHead
  res.writeHead = (statusCode, headers) => {
    res.removeHeader('X-Frame-Options')
    res.removeHeader('X-Content-Security-Policy')
    res.removeHeader('Content-Security-Policy')
    res.removeHeader('X-WebKit-CSP')
    res.removeHeader('Access-Control-Allow-Origin')
    res.setHeader('Access-Control-Allow-Origin', proxyUrl)

    res.oldWriteHead(statusCode, headers)
  }
  next()
})

// Update Content security policy

app.use(helmet.frameguard({
  action: 'allow-from',
  domain: sameOriginDomain,
}))

app.use(helmet.csp({
  directives: {
    'frame-ancestors': [sameOriginDomain],
  },
  reportOnly: false,
  setAllHeaders: true,
}))


/**
 * Proxing incoming url
 */
function proxyRequest(req, res) {
  const urlObj = url.parse(req.url, true)

  const relativeHost = urlObj.protocol + '//' + urlObj.host

  const options = {
    changeOrigin: true,
    secure: false,
    target: relativeHost,
    ws: true,
    headers: {
      host: urlObj.hostname,
    },
  }

  if (urlObj.protocol === 'https') options.agent = https.globalAgent

  try {
    proxy.web(req, res, options)
  } catch (e) {
    console.log(req.url)
    console.log(e)
  }
}

app.use(proxyRequest)


/**
 * Starting proxy server as cluster
 */

const numCPUs = require('os').cpus().length


if (cluster.isMaster) {
  // Fork workers.
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork()
  }

  cluster.on('exit', (worker) => {
    const date = new Date()
    console.log(date + ': worker ' + worker.process.pid + ' died')
  })
} else {
  let proxyServer
  let port

  if (env === 'dev') port = 3333
  if (env === 'production') port = 80

  proxyServer = http.createServer(app).listen(port)

  console.log('Worker started')

  proxyServer.on('upgrade', (req, socket, head) => {
    const isNotFullPath = (req.url.indexOf('ws') !== 0)

    // Update req.url from cookies in case if path is not full
    if (isNotFullPath) {
      const cookies = new Cookies(req)
      const campaignURL = decodeURIComponent(cookies.get('campaignURL'))

      let socketURL = url.resolve(campaignURL, req.url)

      socketURL = socketURL.replace('http', 'ws')

      req.url = socketURL
    }

    try {
      proxy.ws(req, socket, head)
    } catch (e) {
      console.log(e)
      if (req) console.log(req.url)
    }
  })
}


process.on('uncaughtException', (err) => {
  console.error((new Date).toUTCString() + ' uncaughtException:', err.message)
  console.error(err.stack)
  process.exit(1)
})
