var assert = require("assert");
var fs = require("fs");
var crypto = require("crypto");
var bee = require("../");

var tests = {
    expected: 63,
    executed: 0,
    finished: function() { tests.executed++; }
};
var warnings = {};
console.warn = function(msg) { warnings[msg] = true; tests.finished(); };

var router = bee.route({
    "/test": function(req, res) { assert.equal(req.url, "/test?param=1&woo=2"); tests.finished(); },
    "/throw-error": function(req, res) { throw Error("500 should catch"); },
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
    "/`user`/profile": function(req, res, tokens, vals) { // Ensure tokens are decoded but not vals
        assert.equal(req.url, "/%E2%88%91%C3%A9%C3%B1/profile");
        assert.equal(tokens["user"], "∑éñ");
        assert.equal("%E2%88%91%C3%A9%C3%B1", vals[0]);
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
    "`500`": function(req, res, err) {
        try { assert.equal(req.url, "/throw-error"); }
        catch(e) {
            console.error(e.stack);
            console.error("Caused by:");
            console.error(err.stack);
            process.exit();
        }
        assert.equal(err.message, "500 should catch");
        tests.finished();
    }
});
router({ url: "/test?param=1&woo=2" });
router({ url: "/throw-error" });
router({ url: "/names/smith/will" });
router({ url: "/actors/smith/will" });
router({ url: "/da-oozer/static/pictures/venkman.jpg" });
router({ url: "/%E2%88%91%C3%A9%C3%B1/profile" });
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
        "POST PUT": function(req, res, tokens, vals) {
            assert.ok(req.method === "POST" || req.method === "PUT");
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
router({ url: "/dozer/profile/timeline/2010/holloween", method: "PUT" });
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
    "`500`": function() { },
    "`not-a-valid-rule": function() { }
});

assert.ok(warnings["Duplicate beeline rule: /home"]);
assert.ok(warnings["Duplicate beeline rule: r`^/actors/([\\w]+)/([\\w]+)$`"]);
assert.ok(warnings["Duplicate beeline rule: /`user`/static/`path...`"]);
assert.ok(warnings["Duplicate beeline rule: `404`"]);
assert.ok(warnings["Duplicate beeline rule: `405`"]);
assert.ok(warnings["Duplicate beeline rule: `500`"]);
assert.ok(warnings["Invalid beeline rule: `not-a-valid-rule"]);

// Testing explicit 404, 405, and error calls
var router2 = bee.route({
    "`404`": function(req, res) {
        assert.equal(req.url, "/explicit-404");
        assert.equal(res.isCorrectRequest, 1);
        assert.equal(this.extra, 1);
        tests.finished();
    },
    "`405`": function(req, res) {
        assert.equal(req.url, "/explicit-405");
        assert.equal(res.isCorrectRequest, 2);
        assert.equal(this.extra, 2);
        tests.finished();
    },
    "`500`": function(req, res, err) {
        assert.equal(req.url, "/explicit-500");
        assert.equal(res.isCorrectRequest, 3);
        assert.ok(err.isError);
        assert.equal(this.extra, 3);
        tests.finished();
    }
});
router2.missing({ url: "/explicit-404" }, { isCorrectRequest: 1 }, { extra: 1 });
router2.missingVerb({ url: "/explicit-405" }, { isCorrectRequest: 2 }, { extra: 2 });
router2.error({ url: "/explicit-500" }, { isCorrectRequest: 3 }, { isError: true }, { extra: 3 });

// Testing default 404, 405, and error handlers
var route3 = bee.route();
route3.missing({ request: true }, {
    writeHead: function(status, headers) {
        assert.equal(status, 404);
        this.contentLength = headers["Content-Length"];
        tests.finished();
    },
    end: function(body) {
        assert.equal(this.contentLength, body.length);
        tests.finished();
    }
});
route3.missingVerb({ request: true }, {
    writeHead: function(status, headers) {
        assert.equal(status, 405);
        this.contentLength = headers["Content-Length"];
        tests.finished();
    },
    end: function(body) {
        assert.equal(this.contentLength, body.length);
        tests.finished();
    }
});
route3.error({ request: true }, {
    writeHead: function(status, headers) {
        assert.equal(status, 500);
        this.contentLength = headers["Content-Length"];
        tests.finished();
    },
    end: function(body) {
        assert.equal(this.contentLength, body.length);
        tests.finished();
    }
}, {});

var staticFile = bee.staticFile("../index.js", "application/x-javascript");
fs.readFile("../index.js", function(err, data) {
    if(err) { throw err; }
    
    var isHeadWritten = false, setHeaders = {};
    staticFile({ headers: {}, url: "/load-existing-static-file" }, { // Mock response
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
static404({ url: "/load-non-existent-static-file" }, { // Mock response
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

    var sum = crypto.createHash("sha1").update(data).digest("hex");
    
    var isHeadWritten = false, setHeaders = {};
    staticDir({ headers: {}, url: "/load-existing-file-from-static-dir" }, { // Mock response of an empty cache
        setHeader: function(type, val) {
            setHeaders[type] = val;
        },
        writeHead: function(status, headers) {
            assert.equal(status, 200);
            assert.equal(headers["Content-Type"], "application/json");
            assert.equal(headers["Content-Length"], data.length);
            assert.ok(setHeaders["Cache-Control"]);
            assert.equal(setHeaders["ETag"], sum);
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

    var sum = crypto.createHash("sha1").update(data).digest("hex");

    var isHeadWritten = false, setHeaders = {};
    staticDir({ headers: { "if-none-match": sum }, url: "/do-304s-work" }, { // Mock cached response
        setHeader: function(type, val) {
            setHeaders[type] = val;
        },
        writeHead: function(status, headers) {
            assert.equal(status, 304);
            assert.ok(setHeaders["Cache-Control"]);
            assert.equal(setHeaders["ETag"], sum);
            tests.finished();
            isHeadWritten = true;
        },
        removeHeader: function(header) {
            assert.equal(header, "Set-Cookie");
            assert.ok(!isHeadWritten);
            tests.finished();
        },
        end: function(body) {
            assert.ok(!body); // Ensure an empty body was sent
            fs.unwatchFile("../package.json"); // Internally beelines watches files for changes
            tests.finished();
        }
    }, [ "package.json" ]);
});
fs.readFile("../package.json", function(err, data) {
    if(err) { throw err; }

    var isHeadWritten = false, setHeaders = {};
    staticDir({ headers: {}, url: "/called-with-optional-3rd-param" }, { // Mock response
        setHeader: function(type, val) { },
        writeHead: function(status, headers) { },
        removeHeader: function(header) { },
        end: function(body) {
            assert.deepEqual(body, data);
            fs.unwatchFile("../package.json"); // Internally beelines watches files for changes
            tests.finished();
        }
    }, { optional: "third parameter" }, [ "package.json" ]); // Called with optional third parameter
});
staticDir({ url: "/load-unrecognized-file-extension" }, { // Mock response
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

staticDir({ url: "/attempt-to-insecurely-access-parent-directory" }, { // Mock response
    writeHead: function(status, headers) {
        assert.equal(status, 404);
        assert.ok(headers["Content-Type"]);
        tests.finished();
    },
    end: function(body) {
        assert.ok(body);
        tests.finished();
    }
}, [ "..", "..", "ok.json" ]);

// Testing express compatibility
var router4 = bee.route({
    "/throw-error": function(req, res, next) { throw Error("500 should catch"); }
});
router4({ url: "/unknown-url" }, {}, function next() {
    tests.finished();
});
router4({ url: "/throw-error" }, {}, function next(err) {
    assert.equal(err.message, "500 should catch");
    tests.finished();
});

var daNext = function() {};
router4.add({
    "/test": function(req, res, next) {
        assert.strictEqual(next, daNext);
        tests.finished();
    },
    "/names/`last-name`/`first-name`": function(req, res, tokens, vals, next) {
        assert.strictEqual(next, daNext);
        tests.finished();
    },
    "/static/`path...`": function(req, res, tokens, vals, next) {
        assert.strictEqual(next, daNext);
        tests.finished();
    },
    "/`user`/static/`path...`": function(req, res, tokens, vals, next) {
        assert.strictEqual(next, daNext);
        tests.finished();
    },
    "r`^/actors/([\\w]+)/([\\w]+)$`": function(req, res, matches, next) {
        assert.strictEqual(next, daNext);
        tests.finished();
    },
    "`generics`": [ {
        test: function(req) { return req.triggerGeneric; },
        handler: function(req, res, next) {
            assert.strictEqual(next, daNext);
            tests.finished();
        }
    } ],
    "`404`": function(req, res, next) {
        assert.strictEqual(next, daNext);
        tests.finished();
    },
    "`500`": function(req, res, err, next) {
        try { assert.equal(req.url, "/throw-error"); }
        catch(e) {
            console.error(e.stack);
            console.error("Caused by:");
            console.error(err.stack);
            process.exit();
        }

        assert.strictEqual(next, daNext);
        tests.finished();
    }
});

router4({ url: "/test?param=1&woo=2" }, {}, daNext);
router4({ url: "/throw-error" }, {}, daNext);
router4({ url: "/names/smith/will" }, {}, daNext);
router4({ url: "/actors/smith/will" }, {}, daNext);
router4({ url: "/da-oozer/static/pictures/venkman.jpg" }, {}, daNext);
router4({ url: "/static/pictures/actors/smith/will.jpg" }, {}, daNext);
router4({ url: "/random", triggerGeneric: true }, {}, daNext);
router4({ url: "/url-not-found" }, {}, daNext);

process.on("exit", function() {
    assert.equal(tests.executed, tests.expected);
    console.log("\n\nAll done.  Everything passed.");
});
