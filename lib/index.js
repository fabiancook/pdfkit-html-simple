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
  EventEmitter = require('events'),
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
 * @param {{}} [options={}]
 * @returns {Promise}
 */
exports.parse = function(html, options) {

  if(!('string' === typeof html || Buffer.isBuffer(html))) {
    throw new Error('html must be a string or buffer');
  } else {
  }

  const document = Parse.parse(
    exports.transformHTML(html),
    {
      treeAdapter: Parse.treeAdapters.htmlparser2
    }
  ),
    nodes = exports.listen(document);

  const transformations = exports.convertNodesToTransformations(nodes, options);

  return Promise.resolve(
    transformations
  );
};

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

exports.emitNodes = function(emitter, node, level, index) {
  level = level || 0;
  index = index || 0;

  node.id = `level(${level}) index(${index}) parent(${node.parentNode && node.parentNode.id || ''}) ${node.tagName || node.nodeName}`;
  node.level = level;

  if(!node.tagName) {
    return iterateChildren(node);
  }

  emitter.emit('startTag', node.tagName, node.id, node.parentNode && node.parentNode.id, node.attribs, node.level);

  iterateChildren(node, true);

  emitter.emit('endTag', node.id, node.parentNode && node.parentNode.id, node.attrs);

  function iterateChildren(node, taggedElement) {
    if(!(node.childNodes instanceof Array)) {
      return;
    }

    if(taggedElement && node.childNodes.length === 1 && node.childNodes[0].type === 'text') {
      return emitter.emit('text', node.id, node.childNodes[0].data || '');
    }

    node
      .childNodes
      .forEach(function(childNode, index) {
        childNode.parentNode = node;
        return exports.emitNodes(emitter, childNode, level + 1, index);
      });
  }
};

exports.listen = function(document) {

  // const objects = [];
  // console.log(JSON.stringify(document, function(key, value) {
  //   if(!(value instanceof Object)) {
  //     return value;
  //   }
  //   if(objects.indexOf(value) === -1) {
  //     objects.push(value);
  //     return value;
  //   }
  //   return undefined;
  // }, '  '));

  let result = [];

  const elements = {};

  const emitter = new EventEmitter();

  emitter.on('startTag', startTag);

  emitter.on('endTag', endTag);

  emitter.on('text', function(id, text) {
    elements[id] = (elements[id] || [{ id }]);
    elements[id][elements[id].length - 1].text = text;
  });

  exports.emitNodes(emitter, document);

  emitter.emit('finish');

  // We only want text nodes
  result = result
    .filter(function(node) {
      return node.text;
    });

  result
    .forEach(function(node, index, array) {
      const previous = array[index - 1];
      if(!previous) {
        return;
      }
      previous.nextNode = node;
    });

  // stack.forEach(function(stack) {
  //   endTag(stack.tagName);
  // });

  // console.log(result);

  return result;

  function startTag(name, id, parentId, attributes, level) {
    const parentStack = elements[parentId] || [];

    elements[id] = parentStack.concat(elements[id] || []).concat({
      id: id,
      tagName: name,
      attributes,
      level
    });

  }

  function endTag(id) {
    if(!elements[id]) {
      return;
    }

    const current = elements[id][elements[id].length - 1];

    const object = elements[id].reduce(function(object, current) {
      return Object.assign({}, object, current, {
        attributes: (object.attributes || [])
          .map(function(attribute) {
            return Object.assign({}, attribute, {
              inherited: true
            });
          })
          .concat(
            Object.keys(current.attributes || {})
              .map(function(key) {
                return {
                  name: key,
                  value: current.attributes[key],
                  level: current.level
                };
              })
          ),
        tagNames: (object.tagNames || []).concat(current.tagName)
      });
    }, {});

    result
      .filter(function(node) {
        return node.id === current.id;
      })
      .forEach(function(node) {
        node.parentNode = object;
      });

    result.push(
      object
    );

    elements[id] = undefined;
  }
};

exports.convertNodesToTransformations = function(nodes, options) {
  return nodes.reduce(function(transformations, node) {
    return transformations.concat(
      exports.convertNodeToTransformations(node, options)
    );
  }, []);
};

exports.getStylesForNode = function(node, options) {
  if(node.styles) {
    return node.styles;
  }

  const styleAttributes = node.attributes
    .filter(function(attribute) {
      return attribute.name === 'style';
    });
  const declarationAttributes = node.attributes
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

exports.convertNodeToTransformations = function(node, options) {

  const styles = exports.getStylesForNode(node, options),
    nextStyles = node.nextNode ? exports.getStylesForNode(node.nextNode, options) : {};

  const transformations = [],
    font = {
      bold: false,
      italic: false
    };

  let textOptions = {
    continued: isContinued(styles) && isContinued(nextStyles)
  };
  
  // console.log(node);

  function isContinued(currentStyles) {
    return currentStyles['display'] === 'inline' || currentStyles['display'] === 'inline-block' || !currentStyles['display']
  }

  textOptions.underline = styles['text-decoration'] === 'underline';

  font.bold = (
    styles['font-weight'] === 'bold' ||
    styles['font-weight'] === 'bolder'
  );

  // console.log(node);

  if(styles['font-weight'] && !isNaN(+styles['font-weight'].trim())) {
    font.weight = +styles['font-weight'].trim();
  }

  //i, cite, em, var, address, dfn
  font.italic = styles['font-style'] === 'italic';

  textOptions.stroke = node.tagNames.indexOf('del') > -1;

  transformations.push(function(document) {
    // console.log(font, node.text);
    exports.setFont(document, node, font, styles, options);

    if(styles['color']) {
      document.fillColor(styles['color'], isNaN(+styles['opacity']) ? 1 : +styles['opacity']);
    }

    document.text(node.text ? node.text + ' ' : '', textOptions);

    return Promise.resolve(document);
  });

  return transformations;
};

exports.setFont = function(document, node, font, styles, options) {
  const details = exports.getFont(document, font, styles, options),
    size = exports.getFontSize(node, styles);

  document.font(details.source, size);
};

exports.getFontSize = function(node, styles) {
  const size = exports.getFontSizeBase(node, styles),
    base = 10000;
  return Math.ceil(size * base) / base;
};

exports.getFontSizeBase = function(node, styles) {

  const coreSize = 12,
    fontScale = 4;

  const base = node.previousNode && node.previousNode.styles ?
    exports.getFontSizeBase(node.previousNode, node.previousNode.styles) :
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

  const font = styles['font-family'];

  return font.split(/\s*,\s*/g)
    .map(function(fontName) {
      return fontName
        .replace(/^\s*['"]/, '')
        .replace(/['"]\s*$/, '');
    })
    .find(function(fontName) {
      return options.fonts[fontName];
    }) || baseFont;
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