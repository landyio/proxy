Proxy
===

Proxy makes it easy to proxy any website to the iframe inside your website.

Proxy is open source and is one of the Visual Editor modules that powers Landy.io, automated personalization solution.


Installation
===

We're recommending to run Proxy using docker container. To build a docker image with Proxy use:

```
bash build.sh
```

You will need docker installed to build it.

Configuring
===

You should set ENV variables inside [docker image file](https://github.com/landyio/proxy/blob/master/Dockerfile)

**editorJS** - script URL. Responsible for highlighting elements and removing javascript events to avoid navigation inside the iFrame. You can copy it from [repository](https://github.com/landyio/proxy/blob/master/src/editor.min.js) and upload somewhere on the server/CDN.

**proxyUrl** - url of your proxy. (`https://proxy.landy.io` in our case)

**sameOrigin** - top-level domain, to support editing inside an iFrame (`landy.io` in our case)

To edit an external website which was proxied to an iframe you will need to set the same top-level domain on your website and Proxy.

E.g. at Landy.io we have a proxy on `https://proxy.landy.io` and a visual editor on `https://app.landy.io`. In both cases we're setting our current domain to a `landy.io`, with:

```
document.domain = 'landy.io'
```

Use
===

To proxy any website use `proxyURL + encodeURLcomponent(proxiedUrl)`, where `proxyURL` - your proxyURL and `proxiedURL` is an url which you're going to proxy.

For example:

```
https://proxy.landy.io/https%3A%2F%2Fwww.landy.io
```


Documentation
===

Documentation is on it's way. If you need something specifically feel free to reach us on [friends@landy.io](mailto:friends@landy.io)


License
===
Released under the [MIT license](https://github.com/landyio/proxy/blob/master/LICENSE.md)