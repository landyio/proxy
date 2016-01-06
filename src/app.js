const https = require('https')
const http = require('http')
const fs = require('fs')
const httpProxy = require('http-proxy')
const cluster = require('cluster')
const connect = require('connect')
const url = require('url')
const harmon = require('harmon')
const request = require('request')
const pathToRegexp = require('path-to-regexp')


// Defining enviroment variables

const editorJs = process.env.editorJs || 'https://d2mnlxdd0x11jg.cloudfront.net/editor.min.js'
const proxyUrl = process.env.proxyUrl || 'http://proxy.landy.dev/'
const env = process.env.NODE_ENV || 'dev'
const sameOriginDomain = process.env.sameOrigin || 'landy.dev'


// Creating http proxy
const proxy = httpProxy.createProxyServer({})


// Defining proxied page host to update
// base parameter in HTML Dom
let relativeHost = ''


/**
 * onRequest() parse incoming URL parameter and
 * returns resource at this location through proxy
 */
function onRequest(req, res) {
  // Parse and decode incoming url as parameter

  const keys = []
  const re = pathToRegexp('/:url+', keys)
  const uri = re.exec(req.url)


  const uriParam = uri[1]
  let urlParam = decodeURIComponent(uriParam)


  /**
   * Validate if path is non-full
   * and contains referrer url in headers
   */
  const isNotFullPath = (urlParam.indexOf('http') !== 0 &&
    req.headers.referer)


  if (isNotFullPath) {
    const newPathName = url.parse(req.headers.referer, true).pathname
    const newUri = re.exec(newPathName)

    // Stop request if referrer is valid
    if (!newUri) {
      res.end()
      return
    }

    // Update proxied url
    const targetHost = newUri[1]
    const targetHostObj = url.parse(decodeURIComponent(targetHost), true)

    // Stop request if targetHost is not an url
    if (!targetHostObj.protocol || !targetHostObj.host) {
      res.end()
      return
    }

    urlParam = targetHostObj.protocol + '//' + targetHostObj.host + '/' + urlParam
  }


  const requestOptions = {
    followAllRedirects: false,
    uri: urlParam,
    timeout: 2000,
    strictSSL: false,
  }


  /**
   * request() checks if there is redirect
   * on proxied url and pass it to proxy
   */
  request(requestOptions, (error, response) => {
    const redirectExist = (response &&
      response.request &&
      response.request.uri &&
      response.request.uri.href !== urlParam)

    if (redirectExist) urlParam = response.request.uri.href


    const urlObj = url.parse(urlParam, true)


    relativeHost = urlObj.protocol + '//' + urlObj.host


    const options = {
      changeOrigin: true,
      secure: false,
      target: relativeHost,
      headers: {
        host: urlObj.hostname,
      },
    }

    if (urlObj.protocol === 'https') options.agent = https.globalAgent


    req.url = urlParam

    try {
      proxy.web(req, res, options)
    } catch (e) {
      console.log(e)
    }
  })
}


/**
 * Updating HTML Dom
 */

const selects = []
const head = {}

// Update head tag
head.query = 'head'
head.func = (node) => {
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

    stm.end('<base href="' + proxyUrl + encodeURIComponent(relativeHost) + '/">' +
      '<script>document.domain = "' + sameOriginDomain + '";</script>' +
      '<meta name="referrer" content="origin-when-crossorigin">' +
      tag)
  })
}

selects.push(head)

// Update body tag
const body = {}
body.query = 'body'
body.func = (node) => {
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
}

selects.push(body)


const app = connect()


/**
 * Update headers to allow embedding resource
 * in iframe and cross-origin resources
 */

app.use((req, res, next) => {
  res.oldWriteHead = res.writeHead
  res.writeHead = (statusCode, headers) => {
    res.removeHeader('X-Frame-Options')
    res.removeHeader('Access-Control-Allow-Origin')
    res.setHeader('Access-Control-Allow-Origin', proxyUrl)

    res.oldWriteHead(statusCode, headers)
  }

  next()
})

// Update HTML Dom
app.use(harmon([], selects, true))

// Proxy resource
app.use(onRequest)


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
  if (env === 'dev') {
    http.createServer(app).listen(3333)
  }

  if (env === 'production') {
    const certs = {
      key: fs.readFileSync('/etc/ssl/certs/server.key'),
      cert: fs.readFileSync('/etc/ssl/certs/proxy_landy_io.crt'),
      ca: fs.readFileSync('/etc/ssl/certs/proxy_landy_io.ca-bundle'),
    }

    https.createServer(certs, app).listen(443)
  }
}


process.on('uncaughtException', (err) => {
  console.error((new Date).toUTCString() + ' uncaughtException:', err.message)
  console.error(err.stack)
  process.exit(1)
})