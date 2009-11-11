Clear Key
=========

 1. Prepare database with some example data:
    couchdb-load --input=data.json http://localhost:5984/clearkey
 1. Load clearkey into the database:
    couchapp push http://localhost:5984/clearkey
 1. Use clearkey: http://localhost:5984/clearkey/_design/clearkey/index.html