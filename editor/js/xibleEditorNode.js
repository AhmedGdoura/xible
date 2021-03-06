'use strict';

class XibleEditorNode extends xibleWrapper.Node {
  constructor(obj, ignoreData) {
    const el = document.createElement('div');
    el.classList.add('node');

    const headerEl = el.appendChild(document.createElement('h1'));

    // add ios
    const ios = el.appendChild(document.createElement('div'));
    ios.classList.add('io');

    // add input list
    const inputList = ios.appendChild(document.createElement('ul'));
    inputList.classList.add('input');

    // add output list
    const outputList = ios.appendChild(document.createElement('ul'));
    outputList.classList.add('output');

    super(Object.assign({}, obj, {
      element: el,
      inputList,
      outputList
    }), ignoreData);

    /*
     * Increase max listeners limit.
     * Especially the 'position' event handler can be hooked plenty of times,
     * depending on the amount of connectors for a node.
     */
    this.setMaxListeners(1000);

    headerEl.appendChild(document.createTextNode(this.name));

    // add additional content
    if (this.hostsEditorContent) { // load editor static hosted content for this node
      this.getAndProcessEditorContent();
    } else if (!this.nodeExists && obj.editorContent) {
      this.processEditorContent(obj.editorContent);
    }

    this.statusTimeouts = {};
    this.statusEl = null;

    // selection handlers
    this.element.addEventListener('mousedown', (event) => {
      if (this.editor) {
        this.editor.toggleSelectionOnMouseEvent(event, this);
      }
    });
    this.element.addEventListener('mouseup', (event) => {
      if (this.editor) {
        this.editor.toggleSelectionOnMouseEvent(event, this);
      }
    });

    // direct handler
    headerEl.addEventListener('dblclick', () => {
      if (!this.editor || this.type !== 'action' || !this.editor.browserSupport) {
        return;
      }

      // check if direct mode is alowed before continuing
      xibleWrapper.Config
      .getValue('editor.flows.allowdirect')
      .then((allowDirect) => {
        if (!allowDirect) {
          return;
        }

        this.flow.undirect();

        // fetch all related connectors and nodes for the double clicked node
        const related = XibleEditorNode.getAllInputObjectNodes(this);

        // don't forget about globals
        related.nodes = related.nodes.concat(this.flow.getGlobalNodes());

        related.nodes.forEach((node) => {
          node._directSetDataListener = () => this.editor.loadedFlow.direct(related.nodes);
          node.on('setdata', node._directSetDataListener);
        });

        this.editor.loadedFlow.nodes
        .filter(node => related.nodes.indexOf(node) === -1)
        .forEach((node) => {
          node.element.classList.add('nodirect');
        });

        this.editor.loadedFlow.connectors
        .filter(connector => related.connectors.indexOf(connector) === -1)
        .forEach((connector) => {
          connector.element.classList.add('nodirect');
        });

        this.editor.loadedFlow.direct(related.nodes);
      });
    });

    if (!obj.nodeExists) {
      this.element.classList.add('fail');
      this.addStatus({
        _id: 1,
        color: 'red',
        message: 'This node does not exist in this configuration'
      });
    }
  }

  initInputs(inputs) {
    this.inputs = {};
    if (inputs) {
      for (const name in inputs) {
        this.addInput(new XibleEditorNodeInput(name, inputs[name]));
      }
    }
  }

  initOutputs(outputs) {
    this.outputs = {};
    if (outputs) {
      for (const name in outputs) {
        this.addOutput(new XibleEditorNodeOutput(name, outputs[name]));
      }
    }
  }

  getAndProcessEditorContent() {
    const proc = () => {
      this.getEditorContent()
      .then((data) => {
        this.processEditorContent(data);
      });
    };

    if (this.editor) {
      proc();
    } else {
      this.once('beforeAppend', proc);
    }
  }

  processEditorContent(content) {
    this.editorContent = content;

    const proc = () => {
      const div = document.createElement('div');
      div.classList.add('content');

      // if attachShadow shadow DOM v1) is not supported, simply don't show contents
      if (typeof div.attachShadow !== 'function') {
        return;
      }

      this.element.appendChild(div);

      // create the shadow and set the contents including the nodeContent.css
      const shadow = div.attachShadow({
        mode: 'open'
      });
      shadow.xibleNode = this;

      // hook base document stuff
      shadow.createElement = (...args) => document.createElement(...args);
      shadow.createElementNS = (...args) => document.createElementNS(...args);
      shadow.createTextNode = (...args) => document.createTextNode(...args);

      let templateEl = document.getElementById(`xible-node-${this.name}`);
      if (!templateEl) {
        const textTemplate = `<template><style>@import url("css/nodeContent.css");</style>${content}</template>`;
        const template = new DOMParser().parseFromString(textTemplate, 'text/html');
        templateEl = template.querySelector('template');
        templateEl = document.body.appendChild(template.querySelector('template'));
        templateEl.setAttribute('id', `xible-node-${this.name}`);

        // remove scripts
        // so we can evaulate them in a seperate function with a specific document argument.
        templateEl.plainScripts = Array.from(templateEl.content.querySelectorAll('script'))
        .map((scriptEl) => {
          const scriptContent = scriptEl.textContent;
          scriptEl.parentNode.removeChild(scriptEl);

          return scriptContent;
        });
      }

      const templateContent = templateEl.content;

      shadow.appendChild(templateContent.cloneNode(true));

      // append the div & shadowroot to the node
      this.shadowRoot = shadow;

      templateEl.plainScripts.forEach((script) => {
        new Function('document', script).call(this, shadow);
      });

      // trigger some convenience stuff
      this.convenienceLabel();
      this.convenienceHideIfAttached();
      this.convenienceOutputValue();
      this.convenienceTextAreaSetup();

      this.emit('editorContentLoad');
    };

    if (this.editor) {
      proc();
    } else {
      this.once('beforeAppend', proc);
    }
  }

  setPosition(left = 0, top = 0) {
    super.setPosition(left, top);
    this.element.style.transform = `translate(${this.left}px, ${this.top}px)`;
  }

  duplicate(ignoreData) {
    const duplicateXibleNode = new XibleEditorNode(this, ignoreData);
    duplicateXibleNode.flow = null;
    duplicateXibleNode.editor = null;

    // create a unique id for the node
    duplicateXibleNode._id = xibleWrapper.generateObjectId();

    // create a unique id for the inputs
    // and reset the type
    for (const name in duplicateXibleNode.inputs) {
      duplicateXibleNode.inputs[name]._id = xibleWrapper.generateObjectId();
      duplicateXibleNode.inputs[name].setType(duplicateXibleNode.inputs[name].structureType);
    }

    // create a unique id for the outputs
    // and reset the type
    for (const name in duplicateXibleNode.outputs) {
      duplicateXibleNode.outputs[name]._id = xibleWrapper.generateObjectId();
      duplicateXibleNode.outputs[name].setType(duplicateXibleNode.outputs[name].structureType);
    }

    return duplicateXibleNode;
  }

  addInput(input) {
    super.addInput(input);
    this.inputList.appendChild(input.element);

    return input;
  }

  addOutput(output) {
    super.addOutput(output);
    this.outputList.appendChild(output.element);

    return output;
  }

  deleteInput(input) {
    super.deleteInput(input);
    this.inputList.removeChild(input.element);
    return input;
  }

  deleteOuput(output) {
    super.deleteOuput(output);
    this.outputList.removeChild(output.element);
    return output;
  }

  delete() {
    if (this.editor) {
      this.editor.deleteNode(this);
    }

    super.delete();
  }

  addProgressBar(status) {
    if (!status || !status._id) {
      return;
    }

    let ul = this.statusEl;
    if (!ul) {
      ul = this.statusEl = this.element.appendChild(document.createElement('ul'));
      ul.classList.add('statuses');
    }

    const li = ul.appendChild(document.createElement('li'));
    li.setAttribute('data-statusid', status._id);
    li.classList.add('bar');

    if (status.message) {
      li.appendChild(document.createTextNode(status.message));
    }

    const statusBarHolder = li.appendChild(document.createElement('div'));
    statusBarHolder.classList.add('holder');
    statusBarHolder.appendChild(document.createElement('div'));

    if (status.timeout) {
      // check when this progressbar should start (future)
      // or when it started (past)
      const startDiff = Date.now() - status.startDate + this.editor.serverClientDateDifference;

      this.statusTimeouts[status._id] = window.setTimeout(() => {
        this.removeStatusById(status._id);
      }, status.timeout - startDiff);
    }

    this.updateProgressBarById(status._id, status);
  }

  updateProgressBarById(statusId, status) {
    if (!this.statusEl || !statusId || !status || typeof status.percentage !== 'number') {
      return;
    }

    const li = this.statusEl.querySelector(`li.bar[data-statusid="${statusId}"]`);
    if (li) {
      const bar = li.querySelector('.holder>div');
      bar.style.transition = 'none';
      bar.style.width = `${status.percentage}%`;

      if (status.updateOverTime) {
        // check when this progressbar should start (future)
        // or when it started (past)
        let startDiff = Date.now() - status.startDate + this.editor.serverClientDateDifference;

        // max it out
        if (startDiff > status.updateOverTime) {
          startDiff = status.updateOverTime;
        }

        // if this progressbar should have started in the past
        // calculate where the width should be right now
        if (startDiff > 0) {
          bar.style.width = `${startDiff / status.updateOverTime * 100}%`;
        }

        bar.offsetWidth; // eslint-disable-line
        bar.style.transition = `width ${status.updateOverTime - (startDiff > 0 ? startDiff : 0)}ms ${startDiff < 0 ? Math.abs(startDiff) : 0}ms linear`;
        bar.style.width = '100%';
      }
    }
  }

  async addStatus(status) {
    if (!status || !status._id) {
      return;
    }

    const configMaxStatuses = await xibleWrapper.Config.getValue('editor.nodes.statuses.max');

    let statusCount = 0;
    let ul = this.statusEl;
    if (!ul) {
      ul = this.statusEl = this.element.appendChild(document.createElement('ul'));
      ul.classList.add('statuses');
    } else {
      statusCount = ul.querySelectorAll('li:not(.bar)').length;
    }

    // remove all statuses above the max config setting
    if (typeof configMaxStatuses === 'number' && statusCount >= configMaxStatuses && ul.firstChild) {
      while (statusCount >= configMaxStatuses && ul.firstChild) {
        const removeChild = ul.firstChild;
        this.removeStatusById(removeChild.getAttribute('data-statusid'));
        statusCount -= 1;
      }
    }

    if (configMaxStatuses === 0) {
      return;
    }

    const li = ul.appendChild(document.createElement('li'));
    li.setAttribute('data-statusid', status._id);

    if (typeof status.color === 'string') {
      li.classList.add(status.color);
    }

    li.appendChild(document.createTextNode(status.message));

    if (typeof status.timeout === 'number') {
      this.statusTimeouts[status._id] = window.setTimeout(() => {
        this.removeStatusById(status._id);
      }, status.timeout);
    }
  }

  updateStatusById(statusId, status) {
    if (!this.statusEl) {
      return;
    }

    const li = this.statusEl.querySelector(`li[data-statusid="${statusId}"]`);
    if (li) {
      if (status.message) {
        if (li.lastChild) {
          li.removeChild(li.lastChild);
        }

        li.appendChild(document.createTextNode(status.message));
      }
    }
  }

  removeStatusById(statusId, timeout) {
    // clear timeout
    if (this.statusTimeouts[statusId]) {
      window.clearTimeout(this.statusTimeouts[statusId]);
      this.statusTimeouts[statusId] = null;
      delete this.statusTimeouts[statusId];
    }

    // get and delete li
    if (this.statusEl) {
      const li = this.statusEl.querySelector(`li[data-statusid="${statusId}"]`);
      if (li) {
        const fn = () => {
          if (this.statusEl) {
            this.statusEl.removeChild(li);
          }
        };

        if (timeout) {
          window.setTimeout(fn, timeout);
        } else {
          fn();
        }
      }
    }
  }

  removeAllStatuses() {
    // clear all timeouts
    let statusId;
    for (statusId in this.statusTimeouts) {
      window.clearTimeout(this.statusTimeouts[statusId]);
      this.statusTimeouts[statusId] = null;
      delete this.statusTimeouts[statusId];
    }

    // destroy the el
    if (this.statusEl) {
      if (this.statusEl.parentNode) {
        this.statusEl.parentNode.removeChild(this.statusEl);
      }
      this.statusEl = null;
    }
  }

  setTracker(status) {
    if (this.removeTrackerTimeout) {
      window.clearTimeout(this.removeTrackerTimeout);
      this.removeTrackerTimeout = null;
    }

    if (this.trackerEl) {
      if (this.trackerEl.parentNode) {
        this.trackerEl.parentNode.removeChild(this.trackerEl);
      }
      this.trackerEl = null;
    }

    if (status) {
      const div = this.trackerEl = document.createElement('div');
      div.classList.add('tracker');

      if (status.color) {
        div.classList.add(status.color);
      }

      if (status.message) {
        this.element.appendChild(div).appendChild(document.createTextNode(status.message));
      }

      if (status.timeout) {
        this.removeTrackerTimeout = window.setTimeout(() => {
          this.setTracker();
        }, status.timeout);
      }
    }
  }

  getRootLabelElements() {
    return Array.from(this.shadowRoot.querySelectorAll(':host>label'));
  }

  getRootInputElements() {
    return Array.from(this.shadowRoot.querySelectorAll(':host>input, :host>selectcontainer, :host>textarea'));
  }

  /**
  * Creates a label for every input/selectcontainer element that doesn't have one.
  */
  convenienceLabel() {
    this.getRootInputElements()
    .forEach((el) => {
      const label = document.createElement('label');
      this.shadowRoot.replaceChild(label, el);
      label.appendChild(el);

      // set the required attribute
      // because the :has() pseudo selector is not available (yet)
      if (
        el.required ||
        (el.nodeName === 'SELECTCONTAINER' && el.querySelector('select') && el.querySelector('select').required)
      ) {
        label.classList.add('required');
      } else {
        label.classList.add('optional');
      }

      // copy the description to the label
      const description = el.getAttribute('data-description');
      if (description) {
        label.setAttribute('data-description', description);
      }

      // add the label
      let placeholder = el.getAttribute('placeholder') || el.getAttribute('data-output-value') || el.getAttribute('data-outputvalue');
      const span = document.createElement('span');

      // try to fetch a placeholder for a select input
      if (!placeholder && el.nodeName === 'SELECTCONTAINER') {
        const selectEl = el.querySelector('select');
        if (selectEl) {
          placeholder = selectEl.getAttribute('placeholder') || selectEl.getAttribute('data-output-value') || selectEl.getAttribute('data-outputvalue');
        }
      }

      if (!placeholder) {
        span.classList.add('unknown');
      }

      span.appendChild(document.createTextNode(placeholder || 'unknown'));
      label.appendChild(span);

      // ensure hideif attached is hooked properly
      const hideIfAttached = el.getAttribute('data-hide-if-attached') || el.getAttribute('data-hideifattached');
      if (hideIfAttached) {
        label.setAttribute('data-hide-if-attached', hideIfAttached);
      }
    });
  }

  convenienceTextAreaSetup() {
    const els = Array.from(this.shadowRoot.querySelectorAll('textarea'));
    els.forEach((el) => {
      el.addEventListener('keydown', (event) => {
        if (event.keyCode === 9) {
          event.preventDefault();

          const selectionStart = el.selectionStart;
          el.value = `${el.value.substring(0, selectionStart)}\t${el.value.substring(el.selectionEnd)}`;
          el.selectionStart = selectionStart + 1;
          el.selectionEnd = selectionStart + 1;
        }
      });
    });
  }

  convenienceOutputValue() {
    const els = Array.from(this.shadowRoot.querySelectorAll('[data-output-value], [data-outputvalue]'));
    els.forEach((el) => {
      const attr = el.getAttribute('data-output-value') || el.getAttribute('data-outputvalue');
      const type = el.getAttribute('type');

      // set the default value
      const value = this.data[attr];
      if (value) {
        if (type === 'checkbox' && el.getAttribute('value') === value) {
          el.checked = true;
        } else if (el.nodeName === 'SELECT') {
          Array.from(el.querySelectorAll('option')).forEach((option) => {
            if ((option.getAttribute('value') || option.textContent) === value) {
              option.selected = true;
            } else {
              option.selected = false;
            }
          });
        } else if (el.nodeName === 'TEXTAREA') {
          el.innerHTML = '';
          el.appendChild(document.createTextNode(value));
        } else {
          el.setAttribute('value', value);
        }
      } else if (value === undefined) {
        if (type === 'checkbox') {
          el.checked = false;
        } else {
          this.data[attr] = el.value;
        }
      }

      switch (type) {
        // hidden inputs don't trigger 'onchange' or 'oninput'
        case 'hidden': {
          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              if (mutation.attributeName === 'value') {
                this.setData(attr, el.value);
              }
            });
          });

          observer.observe(el, {
            attributes: true,
            childList: false,
            characterData: false
          });
          break;
        }

        // checkbox and radio both don't trigger input event
        case 'checkbox':
        case 'radio':
          el.addEventListener('change', () => {
            if (el.checked) {
              this.setData(attr, el.value);
            } else {
              this.setData(attr, null);
            }
          });
          break;

        default:
          el.addEventListener('input', () => {
            this.setData(attr, el.value);
          });
          break;
      }
    });
  }

  convenienceHideIfAttached() {
    const els = Array.from(this.shadowRoot.querySelectorAll('[data-hide-if-attached], [data-hideifattached]'));
    els.forEach((el) => {
      const attr = el.getAttribute('data-hide-if-attached') || el.getAttribute('data-hideifattached');
      let matchArray;
      const ioArray = [];

      const re = /(input|output)\s*\[\s*name\s*=\s*"?(\w*)"?\s*\]/g;
      while ((matchArray = re.exec(attr))) { // eslint-disable-line no-cond-assign
        const io = this[`${matchArray[1]}s`][matchArray[2]];
        if (io) {
          ioArray.push(io);

          if (io.connectors.length) {
            el.style.display = 'none';
          }

          io.on('attach', () => {
            el.style.display = 'none';
          });

          io.on('detach', () => {
            if (ioArray.every(io => !io.connectors.length)) {
              el.style.display = '';
            }
          });
        }
      }
    });
  }
}
