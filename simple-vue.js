let TARGET = null;
const utils = {
  getValue(expr, vm) {
    return vm.$data[expr.trim()];
  },
  setValue(expr, vm, newValue) {
    vm.$data[expr] = newValue;
  },
  model(node, value, vm) {
    const initValue = this.getValue(value, vm);
    new Watcher(value, vm, (newValue) => {
      this.modelUpdater(node, newValue);
    });

    node.addEventListener('input', (e) => {
      const newValue = e.target.value;
      this.setValue(value, vm, newValue);
    });

    this.modelUpdater(node, initValue);
  },
  text(node, value, vm) {
    let result;
    if (value.includes('{{')) {
      // {{ xxx }}
      result = value.replace(/\{\{(.+?)\}\}/g, (...args) => {
        const expr = args[1];
        new Watcher(expr, vm, (newVal) => {
          this.textUpdater(node, newVal);
        })
        return this.getValue(args[1], vm);
      });
    } else {
      // v-text="xxx"
      result = this.getValue(value, vm);
    }

    this.textUpdater(node, result);
  },
  on(node, value, vm, eventName) {
    const fn = vm.$options.methods[value];
    node.addEventListener(eventName, fn.bind(vm), false);
  },
  textUpdater(node, value) {
    node.textContent = value;
  },
  modelUpdater(node, value) {
    node.value = value;
  }
}

// 一个 DOM 节点的依赖及更新
class Watcher {
  constructor(expr, vm, cb) {
    this.expr = expr;
    this.vm = vm;
    this.cb = cb;
    // 通过 getter 对数据进行绑定，标记当前的 watcher
    this.oldValue = this.getOldValue();
  }

  getOldValue() {
    TARGET = this;
    // 通过 getter 读取当前依赖
    const oldValue = utils.getValue(this.expr, this.vm);
    TARGET = null;
    return oldValue;
  }

  update() {
    const newValue = utils.getValue(this.expr, this.vm);
    if (newValue !== this.oldValue) {
      this.cb(newValue);
    }
  }
}

// 一个数据 key 的多个 watcher 依赖
class Dep {
  constructor() {
    this.collect = [];
  }

  addWatcher(watcher) {
    this.collect.push(watcher);
  }

  notify() {
    this.collect.forEach(w => w.update());
  }
}

class Compiler {
  constructor(el, vm) {
    this.el = this.isElementNode(el) ? el : document.querySelector(el);
    this.vm = vm;

    const fragment = this.compileFragment(this.el);

    this.compile(fragment);
    this.el.appendChild(fragment);
  }

  compile(fragment) {
    const childNodes = Array.from(fragment.childNodes);
    childNodes.forEach(childNode => {
      if (this.isElementNode(childNode)) {
        // 标签节点 h1 / input，读取属性，查看是否有 v- 开头的内容
        this.compileElement(childNode);

      } else if (this.isTextNode(childNode)) {
        // 内容文本节点 {{ msg }} 是否有双括号语法
        this.compileText(childNode);
      }

      if (childNode.childNodes && childNode.childNodes.length) {
        this.compile(childNode);
      }
    });
  }

  compileElement(node) {
    // v-model v-text v-on:click
    const attributes = Array.from(node.attributes);
    attributes.forEach(attr => {
      const { name, value } = attr;
      if (this.isDirector(name)) {
        // 指令 v-model, v-text, v-bind, v-on:click
        const [, directive] = name.split('-');
        const [compileKey, eventName] = directive.split(':');
        utils[compileKey](node, value, this.vm, eventName);
      } else if (this.isEventName(name)) {
        // @ 方法执行
        const [, eventName] = name.split('@');
        utils['on'](node, value, this.vm, eventName);
      }
    })
  }

  isDirector(name) {
    return name.startsWith('v-');
  }

  isEventName(name) {
    return name.startsWith('@');
  }

  compileText(node) {
    // {{ msg }}
    const content = node.textContent;
    if (/\{\{(.+)\}\}/.test(content)) {
      utils['text'](node, content, this.vm);
    }
  }

  compileFragment(el) {
    const f = document.createDocumentFragment();
    let firstChild;
    while(firstChild = el.firstChild) {
      f.appendChild(firstChild);
    }
    return f;
  }

  isTextNode(el) {
    return el.nodeType === 3;
  }

  isElementNode(el) {
    return el.nodeType === 1;
  }
}

class Observer {
  constructor(data) {
    this.observe(data);
  }

  observe(data) {
    if (data && typeof data === 'object') {
      Object.keys(data).forEach(key => {
        this.defineReactive(data, key, data[key]);
      })
    }
  }

  defineReactive(obj, key, value) {
    this.observe(value);
    const dep = new Dep();
    Object.defineProperty(obj, key, {
      get() {
        const target = TARGET;
        TARGET && dep.addWatcher(target);
        return value;
      },
      set: (newVal) => {
        if (value === newVal) return;
        this.observe(newVal);
        value = newVal;

        dep.notify();
      }
    })
  }
}

class Vue {
  constructor(options) {
    this.$el = options.el;
    this.$data = options.data;
    this.$options = options;

    // 触发 this.$data.xx 和模版的绑定
    new Observer(this.$data);
    // 处理模版部分，将模版中使用的 data 部分的变量和模版绑定起来
    new Compiler(this.$el, this);

    this.proxyData(this.$data)
  }

  // 可以通过 this.xx 更改 this.$data.xx 的结果
  proxyData(data) {
    Object.keys(data).forEach(key => {
      Object.defineProperty(this, key, {
        get() {
          return data[key];
        },
        set(newVal) {
          data[key] = newVal;
        }
      });
    })
  }
}