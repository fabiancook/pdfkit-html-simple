/*
 Copyright 2016 Fabian Cook

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */
const Lib = require('../../lib'),
  FS = require('fs'),
  PDFDocument = require('pdfkit');

const buffer = FS.readFileSync('examples/simple/example.html');

/**
 * optional options
 */
const options = {
  /**
   * custom css styles
   */
  style: `
    p {
      margin-bottom: 1rem;
    }
  `,
  colors: {
    base: 'black',
    link: 'blue'
  },
  fontSizes: {
    base: 12
  },
  fonts: {
    /**
     * default font, for reference
     */
    'Helvetica': [
      {
        bold: false,
        italic: false,
        source: 'Helvetica'
      },
      {
        bold: true,
        italic: false,
        source: 'Helvetica-Bold'
      },
      {
        bold: false,
        italic: true,
        source: 'Helvetica-Oblique'
      },
      {
        bold: true,
        italic: true,
        source: 'Helvetica-BoldOblique'
      }
    ]
  }
};

const document = new PDFDocument({
  autoFirstPage: true,
  bufferPages: true,
  size: 'A4',
  layout: 'portrait'
});

document.info = document.info || {};
document.info.Title = 'Example';
document.info.Subject = document.info.Title;
document.info.Author = 'Fabian Cook';
document.info.Producer = document.info.Author;
document.info.Creator = document.info.Author;
document.info.Keywords = '';
document.info.CreationDate = new Date();
document.info.ModDate = new Date();

new Promise(function(resolve, reject) {
  const buffers = [];

  document.on('data', function(chunk) {
    buffers.push(chunk);
  });

  document.on('error', reject);

  document.on('end', function() {
    resolve(
      Buffer.concat(buffers)
    );
  });

  document.font(Object.keys(options.fonts)[0]);
  document.fontSize(options.fontSizes.base);

  Lib.parse(buffer, document, options);

  document.flushPages();
  document.end();
})
.then(function(buffer) {
  FS.writeFileSync('examples/simple/output.pdf', buffer);
})
.then(console.log)
.catch(console.error);
