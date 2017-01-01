# PDFKit HTML Simple

Create a PDF from simple HTML text elements


Usage: 

```js
const PDFKitHTML = require('@shipper/pdfkit-html-simple'),
    html = `
    <html>
        <head>
          <style type="text/css">
            .underline,
            .underline * {
              text-decoration: underline;
            }
          </style>
        </head>
        <body>
          <h1>H1</h1>
          <h2>H2</h2>
          <h3>H3</h3>
          <h4>H4</h4>
          <h5>H5</h5>
          <h6>H6</h6>
          <strong>This is bold</strong>
          <span class="underline">
            <strong>This is bold and underlined</strong>
          </span>
          <em>This is italic</em>
          <span style="text-decoration: underline;">This is underlined</span>
          <span class="underline">This is also underlined</span>
        </body>
    </html>
    `;
    
PDFKitHTML.parse(html)
    .then(function(transformations) {
      // We now have an array of functions to invoke with a document
    });
```

The result of the promise being an array of functions, each of which expect one parameter, `document`, and 
will return a promise resolving with that document

To apply the transformations to the document you can do something like this:

```js
const promise = transformations.reduce(function(promise, transformation) {
  return promise.then(transformation);
}, Promise.resolve(document));
```

Once the promise is resolved all transformations will be complete and you will have your document.

See [examples/simple](examples/simple) for example usage
