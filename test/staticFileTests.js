var test = require('tape'),
    bee = require("../");


test('StaticFile defaults max-age to 31536000', function (t) {
    t.plan(1);

    var staticFile = bee.staticFile('./index.js', 'text/javascript');
   
    staticFile({ headers: {}, url: "/load-existing-static-file" }, {
        setHeader: function(type, value) {
            if(type === 'Cache-Control')
            {
                t.equal(value, 'private, max-age=31536000');
            }
        },
        writeHead: function() {},
        removeHeader: function() {},
        end: function() {}
    });

});

test('StaticFile set max-age when provided', function (t) {
    t.plan(1);

    var maxAge = 123456,
        staticFile = bee.staticFile('./index.js', 'text/javascript', maxAge);
   
    staticFile({ headers: {}, url: "/load-existing-static-file" }, {
        setHeader: function(type, value) {
            if(type === 'Cache-Control')
            {
                t.equal(value, 'private, max-age=' + maxAge);
            }
        },
        writeHead: function() {},
        removeHeader: function() {},
        end: function() {}
    });

});

test('StaticFile set max-age when is 0', function (t) {
    t.plan(1);

    var maxAge = 0,
        staticFile = bee.staticFile('./index.js', 'text/javascript', maxAge);
   
    staticFile({ headers: {}, url: "/load-existing-static-file" }, {
        setHeader: function(type, value) {
            if(type === 'Cache-Control')
            {
                t.equal(value, 'private, max-age=' + maxAge);
            }
        },
        writeHead: function() {},
        removeHeader: function() {},
        end: function() {}
    });

});

test('StaticDir defaults max-age to 31536000', function (t) {
    t.plan(1);

    var staticDir = bee.staticDir("./", { ".json": "application/json", "js": "application/x-javascript" });
    staticDir({ headers: {}, url: "/load-existing-file-from-static-dir" }, {
        setHeader: function(type, value) {
            if(type === 'Cache-Control')
            {
                t.equal(value, 'private, max-age=31536000');
            }
        },
        writeHead: function() {},
        removeHeader: function() {},
        end: function() {}
    }, [ "package.json" ]);

});

test('StaticDir set max-age when provided', function (t) {
    t.plan(1);

    var maxAge = 123456;
    debugger;
    var staticDir = bee.staticDir("./", { ".json": "application/json", "js": "application/x-javascript" }, maxAge);
    staticDir({ headers: {}, url: "/load-existing-file-from-static-dir" }, {
        setHeader: function(type, value) {
            if(type === 'Cache-Control')
            {
                t.equal(value, 'private, max-age=' + maxAge);
            }
        },
        writeHead: function() {},
        removeHeader: function() {},
        end: function() {}
    }, [ "package.json" ]);

});

test('StaticDir set max-age when is 0', function (t) {
    t.plan(1);

    var maxAge = 0,
        staticDir = bee.staticDir("./", { ".json": "application/json", "js": "application/x-javascript" }, maxAge);
    staticDir({ headers: {}, url: "/load-existing-file-from-static-dir" }, {
        setHeader: function(type, value) {
            if(type === 'Cache-Control')
            {
                t.equal(value, 'private, max-age=' + maxAge);
            }
        },
        writeHead: function() {},
        removeHeader: function() {},
        end: function() {}
    }, [ "package.json" ]);

});