var assert = require("assert");
var bee = require("../");

var mockResponse = {
    testCount: 10,
    end: function() { this.testCount--; }
}

var router = bee.route({
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
router({ url: "/test?param=1&woo=2" }, mockResponse);
router({ url: "/throw-error" }, mockResponse);
router({ url: "/name/woo" }, mockResponse);
router({ url: "/random", triggerGeneric: true }, mockResponse);
router({ url: "/url-not-found" }, mockResponse);

router.add({ 
    "/ /index": function(req, res) { assert.ok(req.url === "/" || req.url === "/index"); res.end(); }
});
router({ url: "/" }, mockResponse);
router({ url: "/index" }, mockResponse);

router.add({ 
    "/method-test": {
        "GET": function(req, res) { assert.equal(req.method, "GET"); res.end(); },
        "POST": function(req, res) { assert.equal(req.method, "POST"); res.end(); },
        "any": function(req, res) { assert.ok(req.method !== "GET" || req.method !== "POST"); res.end(); }
    }
});
router({ url: "/method-test", method: "GET" }, mockResponse);
router({ url: "/method-test", method: "POST" }, mockResponse);
router({ url: "/method-test", method: "HEAD" }, mockResponse);

assert.ok(mockResponse.testCount === 0);