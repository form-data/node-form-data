/*
Test submitting forms with chunked encoding
*/

var common       = require('../common');
var assert       = common.assert;
var fs           = require('fs');
var path         = require('path');
var mime         = require('mime-types');
var http         = require('http');
var stream       = require('stream');
var crypto       = require('crypto');

var FormData     = require(common.dir.lib + '/form_data');
var IncomingForm = require('formidable').IncomingForm;

var remoteRequestOptions = {
  'hostname': 'placehold.it',
  'port': 80,
  'path': '/100x100',
  'method': 'GET'
};

var remoteRequest = http.request(remoteRequestOptions, function(remoteRes) {

  FIELDS = [
    {name: 'my_field', value:'my_value'},
    {name: 'my_buffer', value: new Buffer([1, 2, 3])},
    {name: 'my_file', value: fs.createReadStream(common.dir.fixture + '/unicycle.jpg')},
    {name: 'remote_chunked_file', value: remoteRes, options: {'filename': 'webServerResponse', 'contentType': 'application/octet-stream'}}
  ];


  server.listen(common.port, function () {
    var form = new FormData();
    var name, options;

    // Add test subjects to the form and hash any streams for comparison
    FIELDS.forEach(function(field) {
      form.append(field.name, field.value, field.options);

      // Buffer any streams out at this point for comparison later.
      if(field.value instanceof stream.Readable) {
        // Get a hash of this stream to compare at the end
        var hash = crypto.createHash('sha1');
        hash.setEncoding('hex');

        field.value.on('end', function() {
          hash.end();
          field._hash = hash.read();
        });

        field.value.pipe(hash)

      }
    });

    // TODO: Test setting a custom header for chunked encoding

    form.submit({
      port: common.port,
      path: '/',
      chunked: true
    }, function (err, res) {
      if (err) {
        throw err;
      }

      assert.strictEqual(res.statusCode, 200);

      // unstuck new streams
      res.resume();

      server.close();
    });
  });
});

remoteRequest.on('error', function(err){
  throw err
})

remoteRequest.end()

var server = http.createServer(function(req, res) {

  // Check headers of the request.
  assert.strictEqual(req.headers['content-length'], undefined)
  assert.strictEqual(req.headers['transfer-encoding'], 'chunked')

  var form = new IncomingForm({uploadDir: common.dir.tmp, hash: "sha1"});

  form.parse(req);

  form
    .on('error', function(error) {
      throw error;
    })
    .on('field', function(name, value) {
      var field = FIELDS.shift();
      assert.strictEqual(name, field.name);
      assert.strictEqual(value, field.value+'');
    })
    .on('file', function(name, file) {
      var field = FIELDS.shift();
      assert.strictEqual(name, field.name);

      // Check the filename
      if(field.options != undefined && field.options.filename != undefined)
        assert.strictEqual(file.name, field.options.filename);
      else
        assert.strictEqual(file.name, path.basename(field.value.path));

      // Check the content type
      if(field.options != undefined && field.options.contentType != undefined)
        assert.strictEqual(file.type, field.options.contentType);
      else
        assert.strictEqual(file.type, mime.lookup(file.name));

      assert.strictEqual(file.hash, field._hash);
    })
    .on('end', function() {
      res.writeHead(200);
      res.end('done');
    });
});