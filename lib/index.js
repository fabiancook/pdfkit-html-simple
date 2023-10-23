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
const Parse = require('parse5'),
  Cheerio = require('cheerio'),
  CSS = require('css'),
  FS = require('fs'),
  Path = require('path');

let defaultStylesheets = [];

loadDefaultStyle('core-css-2.2.css');
loadDefaultStyle('firefox-3.6.3.css');

function loadDefaultStyle(name) {
  try {
    defaultStylesheets.push(
      {
        name: name,
        text: FS.readFileSync(
          Path.join(__dirname, '../' + name),
          'utf-8'
        )
      }
    )
  } catch(e) { }
}

/**
 * @param {string|Buffer} html
 * @param {PDFKit.PDFDocument} pdfdocument
 * @param {{}} [options={}]
 * @returns {Promise}
 */
exports.parse = function(html, pdfdocument, options) {
  if(!('string' === typeof html || Buffer.isBuffer(html))) {
    throw new Error('html must be a string or buffer');
  }
  if(!pdfdocument || typeof pdfdocument.text !== 'function') {
    throw new Error('pdfdocument must be an instance of pdfkit document');
  }

  if (options && options.style && options.style.length > 0) {
    defaultStylesheets.push(
      {
        name: 'style',
        text: options.style
      }
    )
  }

  const document = Parse.parse(
    exports.transformHTML(html),
    {
      treeAdapter: Parse.treeAdapters.htmlparser2
    }
  );

  iterateNodeChildren(document, pdfdocument, options);

  return document;
};

function iterateNodeChildren(node, document, options) {
  if (node.type === 'text' || (node.type === 'tag' && node.name === 'br')) {
    exports.renderNode(
      {
        ...node,
        parentNode: node.parentNode,
        nextNode: node.nextNode
      },
      document,
      options
    );
  }

  if(!(node.childNodes instanceof Array)) {
    return;
  }

  node
    .childNodes
    .forEach(function(childNode, index) {
      childNode.parentNode = node;
      childNode.nextNode = (
        node.childNodes.length > index + 1 ?
        node.childNodes[index + 1] :
        undefined
      );

      return iterateNodeChildren(childNode, document, options);
    });
}

exports.transformHTML = function(html) {
  const $ = Cheerio.load(html);

  const styles = Array.from($('style[type="text/css"]'))
    .map(function(element) {
      return $(element).text();
    });

  $([
    'style',
    'script',
    'head',
    'meta',
    'area',
    'audio',
    'map',
    'track',
    'video',
    'embed',
    'source',
    'canvas',
    'noscript',

    // We probably need to do something for tables, but this is simple html
    'table',
    'tbody',
    'thead',
    'td',
    'th',
    'tr',

    'button',
    'datalist',
    'input',
    'legend',
    'meter',
    'optgroup',
    'options',
    'output',
    'progress',
    'select',
    'details',
    'dialog',
    'menu',
    'menuitem',
    'summary',
    'content',
    'element',
    'shadow',
    'template',
    'img'
  ].join(', ')).remove();

  $('*').attr('data-declarations', '');

  defaultStylesheets.forEach(function(style) {
    exports.decorateCSS($, style.text, style.name);
  });

  styles.forEach(function(style) {
    exports.decorateCSS($, style);
  });

  return $.html();
};

exports.decorateCSS = function($, style, source) {

  const object = CSS.parse(style, {
    silent: true,
    source: source || 'inline-style'
  });

  object
    .stylesheet
    .rules
    .forEach(function(rule) {

      if(!(rule.selectors instanceof Array)) {
        return;
      }

      const declarationsObject = (rule.declarations || []).reduce(function(declarationsObject, declaration) {
        return {
          styles: Object.assign({}, declarationsObject.styles, {
            [declaration.property]: declaration.value
          }),
          positions: Object.assign({}, declarationsObject.positions, {
            [declaration.property]: declaration.position
          })
        }
      }, {styles: {}, positions: {}});

      const declarations = Object.keys(declarationsObject.styles)
        .map(function(key) {
          return `${key}: ${declarationsObject.styles[key]}`;
        })
        .join('; ');

      if(!(declarations && declarations.length)) {
        return;
      }

      rule.selectors
        .forEach(function(selector) {
          let selected;
          try {
            selected = $(selector);
          } catch(e) { }
          if(!(selected && selected.length)) {
            return;
          }
          const existingDeclarations = selected.attr('data-declarations') || '';
          selected.attr('data-declarations', (existingDeclarations ? existingDeclarations + '; ' : '') + declarations);

          // const existingPositions = selected.attr('data-declaration-positions') || '{}';
          // const positions = JSON.stringify(Object.assign({}, JSON.parse(existingPositions), declarationsObject.positions));
          // selected.attr('data-declaration-positions', positions);
        });

    });


};

exports.getStylesForNode = function(node, options) {
  if(node.styles) {
    return node.styles;
  }

  const attributes = Object.keys(node.attribs || {}).map((key) => ({
    name: key,
    value: node.attribs[key]
  }));

  const styleAttributes = attributes
    .filter(function(attribute) {
      return attribute.name === 'style';
    });
  const declarationAttributes = attributes
    .filter(function(attribute) {
      return attribute.name === 'data-declarations';
    });

  const inheritedStyles = exports.getInheritedStyles();

  const levels = {};

  assignToLevel(declarationAttributes);
  assignToLevel(styleAttributes);

  function assignToLevel(attributes) {
    attributes
      .forEach(function(attribute) {
        levels[attribute.level] = (levels[attribute.level] || [])
        levels[attribute.level].push(attribute);
      });
  }

  function turnAttributeStylesIntoObject(attributes) {
    return attributes
      .reduce(function(style, attribute) {
        return style + '; ' + attribute.value;
      }, '')
      .replace(/^\s*;?\s*/, '')
      .replace(/\s*;?\s*$/, '')
      .replace(/(?:\s*;\s*;\s*)+/g, '; ')
      .split('; ')
      .filter(function(style) {
        return style && /:/.test(style);
      })
      .map(function(style) {
        const split = style.split(/\s*:\s*/);
        return {
          property: split[0],
          value: split[1]
        };
      })
      .reduce(function(styles, pair) {
        return Object.assign({}, styles, {
          [pair.property]: pair.value
        });
      }, {});
  }

  // We know, we are assigning to a parameter value
  const baseStyles = Object.keys(levels)
    .sort(function(a, b) {
      return a < b ? -1 : 1;
    })
    .map(function(levelKey) {
      const style = turnAttributeStylesIntoObject(levels[levelKey]);
      return Object.keys(style)
        .filter(function(key) {
          return inheritedStyles.indexOf(key) > -1;
        })
        .reduce(function(remaining, key) {
          return Object.assign({}, remaining, {
            [key]: style[key]
          });
        }, {});
    })
    .reduce(function(styles, object) {
      return Object.assign({}, styles, object);
    }, {});

  const elementStyle = turnAttributeStylesIntoObject(levels[node.level] || []);
  return node.styles = Object.keys(elementStyle)
    .reduce(function(remaining, key) {
      return Object.assign({}, remaining, {
        [key]: elementStyle[key]
      });
    }, baseStyles);

};

exports.renderNode = function(node, document, options) {
  let styles = exports.getStylesForNode(node, options),
    parentStyles = node.parentNode ? exports.getStylesForNode(node.parentNode, options) : {},
    nextStyles = node.nextNode ? exports.getStylesForNode(node.nextNode, options) : {};

  let parentNodes = [];
  let parentNode = node;
  while (parentNode) {
    if (parentNode.name || (parentNode.attribs && Object.keys(parentNode.attribs).length > 0)) {
      parentNodes.push(parentNode);
    }
    parentNode = parentNode.parent;
  }

  parentNodes = parentNodes.reverse();
  const tagNames = parentNodes.filter(v => v.name).map(v => v.name);
  const aryStyles = parentNodes.filter(v => v.attribs && Object.keys(v.attribs).length > 0).map(v =>
    exports.getStylesForNode(
      v,
      options
    )
  );

  const font = {
    bold: false,
    italic: false
  };

  let textOptions = {
    continued: isContinued(styles) &&
               isContinued(nextStyles) &&
               (isContinued(parentStyles) || node.nextNode) &&
               (!node.nextNode || node.nextNode.type !== 'tag' || node.nextNode.name !== 'br')
  };

  function isContinued(currentStyles) {
    return currentStyles['display'] === 'inline' || currentStyles['display'] === 'inline-block' || !currentStyles['display']
  }

  styles = Object.assign({}, ...aryStyles);

  textOptions.underline = (
    styles['text-decoration'] === 'underline' ||
    tagNames.indexOf('u') > -1 ||
    tagNames.indexOf('ins') > -1
  );

  font.bold = (
    styles['font-weight'] === 'bold' ||
    styles['font-weight'] === 'bolder' ||
    // (!isNaN(Number(styles['font-weight'])) && Number(styles['font-weight']) >= 700) ||
    tagNames.indexOf('b') > -1 ||
    tagNames.indexOf('strong') > -1
  );

  if(styles['font-weight'] && !isNaN(+styles['font-weight'].trim())) {
    font.weight = +styles['font-weight'].trim();
  }

  //i, cite, em, var, address, dfn
  font.italic = (
    styles['font-style'] === 'italic' ||
    tagNames.indexOf('i') > -1 ||
    tagNames.indexOf('em') > -1
  );

  textOptions.strike = (
    styles['text-decoration'] === 'line-through' ||
    tagNames.indexOf('s') > -1 ||
    tagNames.indexOf('del') > -1
  );

  // TODO: cannot be included until the pdfkit issue about text align and continued is solved:
  // see: https://github.com/foliojs/pdfkit/issues/774
  // if (['left', 'center', 'right', 'justify'].indexOf(styles['text-align']) > -1) {
  //   textOptions.align = styles['text-align'];
  // }
  // else {
  //   textOptions.align = null;
  // }

  const linkIdx = parentNodes.map(v => v.name).lastIndexOf('a');
  if (linkIdx > -1) {
    textOptions.link = parentNodes[linkIdx].attribs['href'];
    if (!styles['color']) {
      styles['color'] = (
        options && options.colors && options.colors.link ?
        options.colors.link :
        'blue'
      );
    }
  }
  else {
    textOptions.link = null;
    if (!styles['color']) {
      styles['color'] = (
        options && options.colors && options.colors.base ?
        options.colors.base :
        'black'
      );
    }
  }

  // console.log(font, node.text);
  exports.setFont(document, node, font, styles, options);

  if(styles['color']) {
    document.fillColor(styles['color'], isNaN(+styles['opacity']) ? 1 : +styles['opacity']);
  }

  if (node.type === 'tag' && node.name === 'br') {
    // NOTE: if the previous node is text,
    // then we already handled the linebreak by setting continued:false on that text
    // it's the only way to make it behave like it should
    if (!node.prev || node.prev.type !== 'text') {
      document.text('\n', {continued: false});
    }
  }
  else if (node.type === 'text') {
    if (node.data && node.data.substring(0, 2) === '\n') {
      let text = node.data;
      if (node.prev) {
        let prevstyles = exports.getStylesForNode(
          node.prev,
          options
        );
        if (prevstyles && !isContinued(prevstyles)) {
          text = node.data.substring(1);
        }
      }
      if (text) {
        document.text(text || '', textOptions);
      }
    }
    else {
      document.text(node.data || '', textOptions);
    }
  }

  if (node.parentNode && node.parentNode.type === 'tag' && !node.nextNode && parentStyles && (parentStyles['margin'] || parentStyles['margin-bottom'])) {
    let marginBottom;
    if (parentStyles['margin']) {
      let margins = parentStyles['margin'].split(' ');
      switch (margins.length) {
        case 1:
          marginBottom = margins[0];
          break;
        case 2:
          marginBottom = margins[0];
          break;
        case 3:
          break;
        case 4:
          marginBottom = margins[2];
          break;
        case 5:
          marginBottom = margins[2];
          break;
      }
    }
    if (parentStyles['margin-bottom']) {
      marginBottom = parentStyles['margin-bottom'];
    }
    if (marginBottom) {
      const match = marginBottom.match(new RegExp(/^(-?[\d.]+)(px|pt|em|rem|%)?(?:[ ]*!important)?$/));
      if (match) {
        const [m1, val, unit] = match;
        let moveValue = (val && !unit ? val : 0);
        if (val && !isNaN(Number(val)) && unit) {
          const pxToPoint = 0.75;
          switch (unit) {
            case 'px':
              moveValue = (Number(val) * pxToPoint) / Number(exports.getFontSize(node, styles, options));
              break;
            case 'pt':
              moveValue = Number(val) / Number(exports.getFontSize(node, styles, options));
              break;
            case 'em':
              moveValue = Number(val);
              break;
            case 'rem':
              moveValue = Number(val) * (Number(exports.getFontSize(node, {}, options)) / Number(exports.getFontSize(node, styles, options)));
              break;
            // case '%': // ignore this?
            //   break;
          }
        }
        if (moveValue) {
          document.moveDown(moveValue);
        }
      }
    }
  }
};

exports.setFont = function(document, node, font, styles, options) {
  const details = exports.getFont(document, font, styles, options),
    size = exports.getFontSize(node, styles, options);

  document.font(details.source, size);
};

exports.getFontSize = function(node, styles, options) {
  const size = exports.getFontSizeBase(node, styles, options),
    base = 10000;
  return Math.ceil(size * base) / base;
};

exports.getFontSizeBase = function(node, styles, options) {

  const baseSize = 12,
    fontScale = 4;

  const coreSize = (
    options && options.fontSizes ?
    options.fontSizes.base :
    baseSize
  );

  const base = node.previousNode && node.previousNode.styles ?
    exports.getFontSizeBase(node.previousNode, node.previousNode.styles, options) :
    coreSize;

  let fontSize = styles['font-size'];

  if('number' === typeof fontSize) {
    return fontSize;
  }

  if(!fontSize) {
    return base;
  }

  fontSize = fontSize.trim();

  const scale = {
    'xx-small': fontScale,
    'x-small': fontScale * 2,
    'small': fontScale * 3,
    'medium': fontScale * 4,
    'large': fontScale * 5,
    'x-large': fontScale * 6,
    'xx-large': fontScale * 7
  };

  if(scale[fontSize]) {
    return styles['font-size'] = scale[fontSize];
  }

  if(fontSize === 'smaller') {
    return styles['font-size'] =base - fontScale;
  }

  if(fontSize === 'larger') {
    return styles['font-size'] =base + fontSize;
  }

  const emMatch = fontSize.match(/^(\d+(?:\.\d+)?)\s*(r?em)$/);

  if(emMatch && emMatch[2] === 'em') {
    return styles['font-size'] =(+emMatch[1]) * base;
  }

  if(emMatch && emMatch[2] === 'rem') {
    return styles['font-size'] =(+emMatch[1]) * coreSize;
  }

  const pxMatch = fontSize.match(/^(\d+(?:\.\d+)?)\s*(?:px)$/);

  if(pxMatch) {
    return styles['font-size'] =+pxMatch[1];
  }

  const percentageMatch = fontSize.match(/^(\d+(?:\.\d+)?)\s*(?:%)$/);

  if(percentageMatch) {
    return styles['font-size'] =(+percentageMatch[1] / 100) * base;
  }

  return styles['font-size'] = base;
};

exports.getFont = function(document, font, styles, options) {
  const fontName = exports.getFontName(document, styles, options);

  const baseFont = [
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
  ];

  const fontDetails = options && options.fonts && options.fonts[fontName] || baseFont;

  return (
    getMatchFromFont(fontDetails, font, true) ||
    getMatchFromFont(fontDetails, font) ||
    getMatchFromFont(baseFont, font, true) ||
    getMatchFromFont(baseFont, font) ||
    getMatchFromFont(baseFont, {})
  );

  function getMatchFromFont(fontDetails, font, weight) {
    return fontDetails
      .find(function(details) {
        return (
          (!details.bold) === (!font.bold) &&
          (!details.italic) === (!font.italic) &&
          (!weight || details.weight === font.weight)
        );
      })
  }


};

exports.getFontName = function(document, styles, options) {
  let baseFont = 'Helvetica';

  if(!(options && options.fonts instanceof Object)) {
    return baseFont;
  }

  const font = styles['font-family'] || '';

  return font.split(/\s*,\s*/g)
    .map(function(fontName) {
      return fontName
        .replace(/^\s*['"]/, '')
        .replace(/['"]\s*$/, '');
    })
    .find(function(fontName) {
      return options.fonts[fontName];
    }) || Object.keys(options.fonts)[0] || baseFont;
};

exports.getInheritedStyles = function() {
  return [
    // 'display',
    // 'margin',
    // 'padding',
    'text-decoration', // From our POV it is inherited

    'azimuth',
    'border-collapse',
    'border-spacing',
    'caption-side',
    'color',
    'cursor',
    'direction',
    'elevation',
    'empty-cells',
    'font-family',
    'font-size',
    'font-style',
    'font-variant',
    'font-weight',
    'font',
    'letter-spacing',
    'line-height',
    'list-style-image',
    'list-style-position',
    'list-style-type',
    'list-style',
    'orphans',
    'pitch-range',
    'pitch',
    'quotes',
    'richness',
    'speak-header',
    'speak-numeral',
    'speak-punctuation',
    'speak',
    'speech-rate',
    'stress',
    'text-align',
    'text-indent',
    'text-transform',
    'visibility',
    'voice-family',
    'volume',
    'white-space',
    'widows',
    'word-spacing'
  ];
};
