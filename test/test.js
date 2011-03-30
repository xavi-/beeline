var assert = require("assert");
var bee = require("../");

var mockResponse = {
    testCount: 10,
    end: function() { this.testCount--; }
}

var line = bee.line({
    "/test": function(req, res) { assert.equal(req.url, "/test?param=1&woo=2"); res.end(); },
    "/throw-error": function(req, res) { throw Error("503 should catch"); },
    "r`^/name/([\\w-]+)$`": function(req, res, matches) {
        assert.equal(req.url, "/name/woo");
        assert.equal(matches[0], "woo");
        res.end();
    },
    "`generics`": [ {
            test: function(req) { return req.triggerGeneric; },
            handler: function(req, res) { assert.ok(req.triggerGeneric); res.end(); }
        }
    ],
    "`404`": function(req, res) {
        assert.equal(req.url, "/url-not-found");
        res.end();
    },
    "`503`": function(req, res, err) {
        assert.equal(req.url, "/throw-error");
        assert.equal(err.message, "503 should catch");
        res.end();
    }
});
line({ url: "/test?param=1&woo=2" }, mockResponse);
line({ url: "/throw-error" }, mockResponse);
line({ url: "/name/woo" }, mockResponse);
line({ url: "/random", triggerGeneric: true }, mockResponse);
line({ url: "/url-not-found" }, mockResponse);

line.add({ 
    "/ /index": function(req, res) { assert.ok(req.url === "/" || req.url === "/index"); res.end(); }
});
line({ url: "/" }, mockResponse);
line({ url: "/index" }, mockResponse);

line.add({ 
    "/method-test": {
        "GET": function(req, res) { assert.equal(req.method, "GET"); res.end(); },
        "POST": function(req, res) { assert.equal(req.method, "POST"); res.end(); },
        "any": function(req, res) { assert.ok(req.method !== "GET" || req.method !== "POST"); res.end(); }
    }
});
line({ url: "/method-test", method: "GET" }, mockResponse);
line({ url: "/method-test", method: "POST" }, mockResponse);
line({ url: "/method-test", method: "HEAD" }, mockResponse);

assert.ok(mockResponse.testCount === 0);