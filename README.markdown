# Beeline

A laughably simplistic router for node.js

Currently works with node.js v0.3.1 and above

## Goals
* Simple
* Unobtrusive
* Fairly Foolproof
* Easy to debug
* Fast

## Examples

```javascript
var bee = require("beeline");
var router = bee.route({ // Create a new router
    "/cheggit": function(req, res) {
        // Called when req.url === "/cheggit" or req.url === "/cheggit?woo=poo"
    },
    "/names/`last-name`/`first-name`": function(req, res, tokens, values) {
        // Called when req.url contains three parts, the first of is "name".
        // The parameter tokens is an object that maps token names to values.
        // For example if req.url === "/names/smith/will"
        //   then tokens ===  { "first-name": "will", "last-name": "smith" }
        //   and values === [ "will", "smith" ]
    },
    "/static/`path...`": function(req, res, tokens, values) {
        // Called when req.url starts with "/static/"
        // The parameter tokens is an object that maps token name to a value
        // The parameter values is a list of
        // For example if req.url === "/static/pictures/actors/smith/will.jpg"
        //   then tokens === { "path": "pictures/actors/smith/will.jpg" }
        //   and values === [ "pictures/actors/smith/will.jpg" ]
    },
    "/`user`/static/`path...`": function(req, res, tokens, values) {
        // Called when req.url contains at least three parts, the second of which is "static"
        // The parameter tokens is an object that maps token names and value
        // For example if req.url === "/da-oozer/static/pictures/venkman.jpg"
        //   then tokens === { "user": "da-oozer", "path": "pictures/venkman.jpg" }
        //   and values === [ "da-oozer", pictures/venkman.jpg" ]
    },
    "r`^/actors/([\\w]+)/([\\w]+)$`": function(req, res, matches) {
        // Called when req.url matches this regex: "^/actors/([\\w]+)/([\\w]+)$"
        // An array of captured groups is passed as the third parameter
        // For example if req.url === "/actors/smith/will"
        //   then matches === [ "smith", "will" ]
    },
    "`404`": function(req, res) {
        // Called when no other route rule are matched
        //
        // This handler can later be called explicitly with router.missing
    },
    "`503`": function(req, res, err) {
        // Called when an exception is thrown by another router function
        // The error that caused the exception is passed as the third parameter
        // This _not_ guarranteed to catch all exceptions
        //
        // This handler can later be called explicitly with router.error
    }
});

router.add({ // Use `.add` to append new rules to a router 
    "/ /home r`^/index(.php|.html|.xhtml)?$`?": function(req, res) {
        // Called when req.url === "/" or req.url === "/home"
        //    or req.url matches this regex: ^/index(.php|.html|.xhtml)?$ (i.e. req.url === "/index.php")
        // Note that any number of rules can be combined using a space.
        // All rules will call the same request handler when matched.
    },
    "/my-method": { // Method (aka verb) specific dispatch.  Note case matters.
        "GET": function(req, res) {
            // Called when req.url === "/my-method" and req.method === "GET"
        },
        "POST": function(req, res) {
            // Called when req.url === "/my-method" and req.method === "POST"
        },
        "any": function(req, res) {
            // Called when req.url === "/my-method" and req.method is not "GET" or "POST"
        }
    },
    "`405`": function(req, res) {
        // Called when when a URL is specified but no corresponding method (aka verb) matches
        // For example, this handler would be executed if the "any" catch all wasn't spefied
        // in the handler above and req.method === "HEAD"
        //
        // This handler can later be calld explicitly with router.missingVerb
    },
    "/explicit-calls": function(req, res) { // If necessary you can reroute requests
        if(url.parse(req.url).query["item-name"] === "unknown") {
            return router.missing(req, res, this); // Calls the 404 (aka missing) handler
            // The last parameter is optional.  It sets the this pointer in the 404 handler.
        }
        
        if(url.parse(req.url).query["item-name"] === "an-error") {
            return router.error(req, res, err, this); // Calls the 503 (aka error) handler
            // The last parameter is optional.  It sets the this pointer in the 503 handler.
        }
        
        // Do normal request handling
    }
});

require("http").createServer(router).listen(8001); // Starts serve with routes defined above
```

See `test/test.js` for a working example.

## The API

To start, simply store the `beeline` library in a local variable:
```javascript
var bee = require("beeline");
```
The `beeline` library contains the following three methods:

- `bee.route(routes)`: Used to create a new router.  It returns a function called `rtn_fn` that takes [ServerRequest](http://nodejs.org/docs/v0.6.10/api/http.html#http.ServerRequest) and [ServerResponse](http://nodejs.org/docs/v0.6.10/api/http.html#http.ServerResponse) objects as parameters.  The `routes` parameter is an objects that maps rules to handlers.  See examples section for more details.
- `bee.staticFile(path, mimeType)`: This is a utility method that is used to quickly expose static files.  It returns a function called `rtn_fn` that takes [ServerRequest](http://nodejs.org/docs/v0.6.10/api/http.html#http.ServerRequest) and [ServerResponse](http://nodejs.org/docs/v0.6.10/api/http.html#http.ServerResponse) objects as parameters.  When `rtn_fn` is called, the file contents located at `path` are served (via the ServerResponse) with the `Content-Type` set to the `mimeType` parameter.  If the file at `path` does not exist a `404` is served.  Note that the `Cache-Control` header on the response is given a very large max age and all `Set-Cookie` headers are removed.  Here's an example of how you might use `bee.staticFile`:

    ```javascript
    bee.route({
        "/robots.txt": bee.staticFile("./content/robots.txt", "text/plain")
    });
    ```
- `bee.staticDir(path, mimeTypes)`: This is utility method is used to expose directories of files.  It returns a function called `rtn_fn` that takes a [ServerRequest](http://nodejs.org/docs/v0.6.10/api/http.html#http.ServerRequest) object, a [ServerResponse](http://nodejs.org/docs/v0.6.10/api/http.html#http.ServerResponse) object, an optional third parameter, and an array of strings called `matches` as parameters.  Whenever `rtn_fn` is called, the items of `matches` are joined together and then concatenated to `path`.  The resulting string is assumed to be a path to a specific file.  If this file exists, its contents are served (via the ServerResponse) with the `Content-Type` set to the value that corresponds to the file's extension in the `mimeTypes` object.  If the resulting string doesn't point to an existing file or if the file's extension is not found in `mimeTypes`, then a `404` is served.  Also, file extensions require a leading period (`.`) and are assumed to be lowercase.  Note that the `Cache-Control` header on the response is given a very large max age and all `Set-Cookie` headers are removed.  Here's an example of how you might use `bee.staticDir`:

    ```javascript
    bee.route({
        // /pics/mofo.png serves ./content/pics/mofo.png
        // /pics/la-ghetto/oh-gee.gif serves ./content/pics/la-ghetto/oh-gee.gif
        // /pics/woo-fee.tiff serves a 404 since there's no corresponding mimeType specified.
        // This helps prevent accidental exposure.
        "r`^/pics/(.*)$`":
            bee.staticDir("./content/pics/", { ".gif": "image/gif", ".png": "image/png",
                                               ".jpg": "image/jpeg", ".jpeg": "image/jpeg" }),
        // Also works with URLs with tokens
        // /static/help/faq.html serves ./static/help/faq.html
        // /static/properties.json serves a 404 since there's no corresponding mimeType specified.
        "/static/`path...`":
            bee.staticDir("./static/", { ".txt": "text/plain", ".html": "text/html",
                                         ".css": "text/css", ".xml": "text/xml" }),
        // More complicated path constructs also works
        // /will-smith/img-library/headshots/sexy42.jpg serves ./user-images/will-smith/headshots/sexy42.jpg
        "/`user`/img-library/`path...`":
            bee.staticDir("./user-images/", { ".jpg": "image/jpeg", ".jpeg": "image/jpeg" })
    });
    ```
### Precedence Rules

In the event that a request matches two rules, the following precedence rules are considered:

- Fully defined rules take highest precedence.  In other words, `"/index"` has a higher precedences then ``"r`^/index$`"`` even though semantically both rules are exactly the same.
- Tokens and RegExp rules have the same precednce
- RegExp rules take higher precedence than `404`
- `404` and `405` have the lowest precedences
- The `503` rules is outside the precedence rules.  It can potentially be triggered at any time.

If the exact same rule is defined twice, then it's unspecified which request handler will be triggered.

## Getting Beeline

The easiest way to get beeline is with [npm](http://npmjs.org/):

    npm install beeline

Alternatively you can clone this git repository:

    git clone git://github.com/xavi-/beeline.git

## Developed by
* Xavi Ramirez

## License
This project is released under [The MIT License](http://www.opensource.org/licenses/mit-license.php).