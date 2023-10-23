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
          <b>This is also bold</b>
          <span class="underline">
            <strong>This is bold and underlined</strong>
          </span>
          <em>This is italic</em>
          <u>This is mispeled txt (underlined)</u>
          <span style="text-decoration: underline;">This is also underlined</span>
          <span class="underline">This is also underlined</span>
          <ins>This is inserted text (underlined)</ins>
          <del>This is deleted text (strike-through)</del>
          <s>This is inaccurate: red == blue, text (strike-through)</s>
          <span style="text-decoration: line-through;">This is also strike-through</span>
          <p><strong>This is bold text</strong><br>with a linebreak in a paragraph</p>
          <p><strong>This is also bold text<br>with a linebreak in the bold tag</strong>in a paragraph</p>
          <p><strong>This is also bold text</strong><br><strong>With another bold text after linebreak</strong> in a paragraph</p>
          <div style="font-size: 2rem;"><p>This is a paragraph</p>in a div with font-size 2rem</div>
          <div>This is a div</div>
          <div style="font-size: 20px;">This is another div with font-size 20px</div>
          <div style="font-size: 16px; margin-bottom: 3em;">This is another div with font-size 16px, margin-bottom 3em</div>
          <div style="margin-bottom: 3rem;">This is another div with margin-bottom 3rem</div>
          <div style="margin-bottom: 20px;">This is another div with margin-bottom 20px</div>
          <div style="margin-bottom: 20pt;">This is another div with margin-bottom 20pt</div>
          <div><a href="https://www.github.com" target="_blank">This is a link to https://www.github.com</a> in a div</div>
        </body>
    </html>
    `;
    
PDFKitHTML.parse(html, document, options);
```

See [examples/simple](examples/simple) for example usage
