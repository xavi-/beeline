var assert = require("assert");
var fs = require("fs");
var bee = require("../");

var tests = {
    expected: 37,
    executed: 0,
    finished: function() { tests.executed++; }
};
var warnings = {};
console.warn = function(msg) { warnings[msg] = true; tests.finished(); };

var router = bee.route({
    "/test": function(req, res) { assert.equal(req.url, "/test?param=1&woo=2"); tests.finished(); },
    "/throw-error": function(req, res) { throw Error("503 should catch"); },
    "/names/`last-name`/`first-name`": function(req, res, tokens, vals) {
        assert.equal(req.url, "/names/smith/will");
        assert.equal(tokens["first-name"], "will");
        assert.equal(tokens["last-name"], "smith");
        assert.equal(vals[0], "smith");
        assert.equal(vals[1], "will");
        tests.finished();
    },
    "/static/`path...`": function(req, res, tokens, vals) {
        assert.equal(req.url, "/static/pictures/actors/smith/will.jpg");
        assert.equal(tokens["path"], "pictures/actors/smith/will.jpg");
        assert.equal(vals[0], "pictures/actors/smith/will.jpg");
        tests.finished();
    },
    "/`user`/static/`path...`": function(req, res, tokens, vals) {
        assert.equal(req.url, "/da-oozer/static/pictures/venkman.jpg");
        assert.equal(tokens["user"], "da-oozer");
        assert.equal(tokens["path"], "pictures/venkman.jpg");
        assert.equal(vals[0], "da-oozer");
        assert.equal(vals[1], "pictures/venkman.jpg");
        tests.finished();
    },
    "r`^/actors/([\\w]+)/([\\w]+)$`": function(req, res, matches) {
        assert.equal(req.url, "/actors/smith/will");
        assert.equal(matches[0], "smith");
        assert.equal(matches[1], "will");
        tests.finished();
    },
    "`generics`": [ {
            test: function(req) { return req.triggerGeneric; },
            handler: function(req, res) { assert.ok(req.triggerGeneric); tests.finished(); }
        }
    ],
    "`404`": function(req, res) {
        assert.equal(req.url, "/url-not-found");
        tests.finished();
    },
    "`503`": function(req, res, err) {
        try { assert.equal(req.url, "/throw-error"); }
        catch(e) {
            console.error(e.stack);
            console.error("Caused by:");
            console.error(err.stack);
            process.exit();
        }
        assert.equal(err.message, "503 should catch");
        tests.finished();
    }
});
router({ url: "/test?param=1&woo=2" });
router({ url: "/throw-error" });
router({ url: "/names/smith/will" });
router({ url: "/actors/smith/will" });
router({ url: "/da-oozer/static/pictures/venkman.jpg" });
router({ url: "/static/pictures/actors/smith/will.jpg" });
router({ url: "/random", triggerGeneric: true });
router({ url: "/url-not-found" });

router.add({ 
    "/ /home r`^/index(.php|.html|.xhtml)?$`": function(req, res) {
        assert.ok(req.url === "/" || req.url === "/index" || req.url === "/index.php" || req.url === "/home");
        tests.finished();
    }
});
router({ url: "/" });
router({ url: "/index" });
router({ url: "/index.php" });
router({ url: "/home" });

router.add({ 
    "/method-test": {
        "GET": function(req, res) { assert.equal(req.method, "GET"); tests.finished(); },
        "POST": function(req, res) { assert.equal(req.method, "POST"); tests.finished(); },
        "any": function(req, res) { assert.ok(req.method !== "GET" || req.method !== "POST"); tests.finished(); }
    },
    "/`user`/profile/`path...`": {
        "POST": function(req, res, tokens, vals) {
            assert.equal(req.method, "POST");
            assert.equal(req.url, "/dozer/profile/timeline/2010/holloween");
            assert.equal(tokens["user"], "dozer");
            assert.equal(tokens["path"], "timeline/2010/holloween");
            assert.equal(vals[0], "dozer");
            assert.equal(vals[1], "timeline/2010/holloween");
            tests.finished();
        }
    },
    "`405`": function(req, res) {
        assert.equal(req.method, "GET");
        assert.equal(req.url, "/dozer/profile/timeline/2010/holloween");
        tests.finished();
    }
});
router({ url: "/method-test", method: "GET" });
router({ url: "/method-test", method: "POST" });
router({ url: "/method-test", method: "HEAD" });
router({ url: "/dozer/profile/timeline/2010/holloween", method: "POST" });
router({ url: "/dozer/profile/timeline/2010/holloween", method: "GET" });

// Testing preprocessors
router.add({
    "`preprocess`": function(req, res) { req.foo = "bar"; res.bar = "baz"; },
    "/test-preprocess": function(req, res) {
        assert.equal(req.foo, "bar");
        assert.equal(res.bar, "baz");
        tests.finished();
    }
});
router({ url: "/test-preprocess" }, {});

// Testing warning messages
router.add({
    "/home": function() { },
    "r`^/actors/([\\w]+)/([\\w]+)$`": function() { },
    "/`user`/static/`path...`": function() { },
    "`404`": function() { },
    "`405`": function() { },
    "`503`": function() { },
    "`not-a-valid-rule": function() { }
});

assert.ok(warnings["Duplicate beeline rule: /home"]);
assert.ok(warnings["Duplicate beeline rule: r`^/actors/([\\w]+)/([\\w]+)$`"]);
assert.ok(warnings["Duplicate beeline rule: /`user`/static/`path...`"]);
assert.ok(warnings["Duplicate beeline rule: `404`"]);
assert.ok(warnings["Duplicate beeline rule: `405`"]);
assert.ok(warnings["Duplicate beeline rule: `503`"]);
assert.ok(warnings["Invalid beeline rule: `not-a-valid-rule"]);

//Testing explicit 404 and error calls
var router2 = bee.route({
    "`404`": function(req, res) {
        assert.equal(req.url, "/explicit-404");
        assert.ok(res.isRequest);
        assert.ok(this.isThis);
    },
    "`503`": function(req, res, err) {
        assert.equal(req.url, "/explicit-503");
        assert.ok(res.isRequest);
        assert.ok(err.isError);
        assert.ok(this.isThis);
    }
});
router2.missing({ url: "/explicit-404" }, { isRequest: true }, { isThis: true });
router2.error({ url: "/explicit-503" }, { isRequest: true }, { isError: true }, { isThis: true });

var staticFile = bee.staticFile("../index.js", "application/x-javascript");
fs.readFile("../index.js", function(err, data) {
    if(err) { throw err; }
    
    var isHeadWritten = false, setHeaders = {};
    staticFile({ headers: {}, url: "/test" }, { // Mock response
        setHeader: function(type, val) {
            setHeaders[type] = val;
        },
        writeHead: function(status, headers) {
            assert.equal(status, 200);
            assert.equal(headers["Content-Type"], "application/x-javascript");
            assert.equal(headers["Content-Length"], data.length);
            assert.ok(setHeaders["Cache-Control"]);
            assert.ok(setHeaders["ETag"]);
            tests.finished();
            isHeadWritten = true;
        },
        removeHeader: function(header) {
            assert.equal(header, "Set-Cookie");
            assert.ok(!isHeadWritten);
            tests.finished();
        },
        end: function(body) {
            assert.deepEqual(body, data);
            fs.unwatchFile("../index.js");
            tests.finished();
        }
    });
});

var static404 = bee.staticFile("../does-not-exists", "not/real");
static404({ url: "/test" }, { // Mock response
    writeHead: function(status, headers) {
        assert.equal(status, 404);
        assert.notEqual(headers["Content-Type"], "not/real");
        tests.finished();
    },
    end: function(body) {
        assert.ok(body);
        tests.finished();
    }
});

var staticDir = bee.staticDir("../", { ".json": "application/json", "js": "application/x-javascript" });
assert.ok(warnings["Extension found without a leading periond ('.'): 'js'"]);
fs.readFile("../package.json", function(err, data) {
    if(err) { throw err; }
    
    var isHeadWritten = false, setHeaders = {};
    staticDir({ headers: {}, url: "/test" }, { // Mock response
        setHeader: function(type, val) {
            setHeaders[type] = val;
        },
        writeHead: function(status, headers) {
            assert.equal(status, 200);
            assert.equal(headers["Content-Type"], "application/json");
            assert.equal(headers["Content-Length"], data.length);
            assert.ok(setHeaders["Cache-Control"]);
            assert.ok(setHeaders["ETag"]);
            tests.finished();
            isHeadWritten = true;
        },
        removeHeader: function(header) {
            assert.equal(header, "Set-Cookie");
            assert.ok(!isHeadWritten);
            tests.finished();
        },
        end: function(body) {
            assert.deepEqual(body, data);
            fs.unwatchFile("../package.json"); // Internally beelines watches files for changes
            tests.finished();
        }
    }, [ "package.json" ]);
});
fs.readFile("../package.json", function(err, data) {
    if(err) { throw err; }

    var isHeadWritten = false, setHeaders = {};
    staticDir({ headers: {}, url: "/test" }, { // Mock response
        setHeader: function(type, val) { },
        writeHead: function(status, headers) { },
        removeHeader: function(header) { },
        end: function(body) {
            assert.deepEqual(body, data);
            fs.unwatchFile("../package.json"); // Internally beelines watches files for changes
            tests.finished();
        }
    }, { optional: "third parameter" }, [ "package.json" ]);
});
staticDir({ url: "/test" }, { // Mock response
    writeHead: function(status, headers) {
        assert.equal(status, 404);
        assert.ok(headers["Content-Type"]);
        tests.finished();
    },
    end: function(body) {
        assert.ok(body);
        tests.finished();
    }
}, [ "README.markdown" ]);


process.on("exit", function() {
    assert.equal(tests.executed, tests.expected);
    console.log("\n\nAll done everything passed");
});