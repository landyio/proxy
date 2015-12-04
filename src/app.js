var http = require('http'),
  url = require('url'),
  request = require('request'),
  https = require('https'),
  fs = require('fs'),
  cluster = require('cluster');

var env = process.env.NODE_ENV || "dev",
  numCPUs = require('os').cpus().length

if (cluster.isMaster) {
  // Fork workers.
  for (var i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', function (worker, code, signal) {
    var date = new Date()
    console.log(date + ': worker ' + worker.process.pid + ' died');
  });
} else {
  // Workers can share any TCP connection
  // In this case it is an HTTP server
  if (env == "dev") {
    http.createServer(onRequest).listen(9000)
  }

  if (env == "production") {
    var options = {
      key: fs.readFileSync('/src/ssl/server.key'),
      cert: fs.readFileSync('/src/ssl/proxy_landy_io.crt'),
      ca: fs.readFileSync('/src/ssl/proxy_landy_io.ca-bundle')
    };

    https.createServer(options, onRequest).listen(9000);
  }

}


function isURL(str) {
  var urlRegex = '^(?!mailto:)(?:(?:http|https|ftp)://)(?:\\S+(?::\\S*)?@)?(?:(?:(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}(?:\\.(?:[0-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))|(?:(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)(?:\\.(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)*(?:\\.(?:[a-z\\u00a1-\\uffff]{2,})))|localhost)(?::\\d{2,5})?(?:(/|\\?|#)[^\\s]*)?$';
  var url = new RegExp(urlRegex, 'i');
  return str.length < 2083 && url.test(str);
}

function getOccures(searchStr, str, caseSensitive) {
  var startIndex = 0,
    searchStrLen = searchStr.length;
  var index, indices = [];
  if (!caseSensitive) {
    str = str.toLowerCase();
    searchStr = searchStr.toLowerCase();
  }
  while ((index = str.indexOf(searchStr, startIndex)) > -1) {
    indices.push(index);
    startIndex = index + searchStrLen;
  }
  return indices;
}

function injectText(source, injection, position) {
  var new_source = [source.slice(0, position), injection, source.slice(position)].join('');
  return new_source;
}

function onRequest(req, res) {
  var queryData = url.parse(req.url, true).query;
  if (queryData.url && isURL(queryData.url)) {
    var x = request({
      url: queryData.url
    }).on('error', function (e) {
      res.end(e);
    }).pipe(res);

  } else {
    res.end("no url found");
  }
}

process.on('uncaughtException', function (err) {
  console.error((new Date).toUTCString() + ' uncaughtException:', err.message)
  console.error(err.stack)
  process.exit(1)
})
