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
const Cookies = require('cookies')


// Defining enviroment variables

const editorJs = process.env.editorJs || 'https://d2mnlxdd0x11jg.cloudfront.net/editor.min.js'
const proxyUrl = process.env.proxyUrl || 'http://proxy.landy.dev/'
const env = process.env.NODE_ENV || 'dev'
const sameOriginDomain = process.env.sameOrigin || 'landy.dev'


// Creating http proxy
const proxy = httpProxy.createProxyServer({})


// Defining proxied page host to update
// base parameter in HTML Dom
let pagePathName


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
   * and contains updates from 'campaignURL' cookie,
   * which is set on the Meteor side
   */
  const isNotFullPath = (urlParam.indexOf('http') !== 0)


  if (isNotFullPath) {
    const cookies = new Cookies(req, res)
    const parentUrl = decodeURIComponent(cookies.get('campaignURL'))

    if (!parentUrl) {
      res.status(404).end()
      return
    }

    urlParam = url.resolve(parentUrl, urlParam)
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


    const relativeHost = urlObj.protocol + '//' + urlObj.host

    pagePathName = urlObj.path


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


    delete req.headers.cookies
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
const headTag = {}

// Update head tag
headTag.query = 'head'
headTag.func = (node) => {
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
}

selects.push(headTag)

// Update body tag
const bodyTag = {}
bodyTag.query = 'body'
bodyTag.func = (node) => {
  const stm = node.createStream({})
  let tag = ''


  stm.on('data', (data) => {
    tag += data
  })

  stm.on('end', () => {
    // Update path name for Angular / Meteor support
    // Append editor.js to manipulate DOM
    stm.end(tag +
      '<script>window.history.pushState("", "", "' + pagePathName + '");</script>' +
      '<script src="' + editorJs + '"></script>')
  })
}

selects.push(bodyTag)


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
  let proxyServer

  if (env === 'dev') {
    proxyServer = http.createServer(app).listen(3333)
  }

  if (env === 'production') {
    proxyServer = http.createServer(app).listen(80)
  }

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
    }
  })
}


process.on('uncaughtException', (err) => {
  console.error((new Date).toUTCString() + ' uncaughtException:', err.message)
  console.error(err.stack)
  process.exit(1)
})
