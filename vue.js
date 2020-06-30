TARGET = null;
// 数据
// vue 构造函数
class Vue{
    constructor(options){
        this.$el = options.el; // 挂载节点
        this.$data = options.data; // 数据
        this.$options = options;
        
        // 触发this.$data.xx和模版的绑定
        new Observer(this.$data)
        // 处理模版渲染
        new Compiler(this.$el, this);
        
        this.proxyData(this.$data);
    }
    // 通过this.xx 更改this.$data.xx 的结果
    proxyData(data){
        Object.keys(data).forEach(key=>{
            Object.defineProperty(this, key, {
                get(){
                    // console.log(data[key]);
                    return data[key];
                },
                set(newVal){
                    data[key] = newVal;
                }
            })
        })
    }
}

// 处理$data中的数据，使引用类型的数据也能被Object.defineProperty 劫持
class Observer{
    constructor(data){
        this.observer(data);
    }
    observer(data){
        if(data && typeof data === 'object'){
            Object.keys(data).forEach(key=>{
                this.defineReactive(data, key, data[key]);
            })
        }
    }
    defineReactive(obj, key, value){
        this.observer(value) // 如何value 仍然是对象，反复迭代
        const dep = new Dep()
        Object.defineProperty(obj, key, {
            get(){
                const target = TARGET;
                target && dep.addWatcher(target);
                // console.log('get', key, value);
                return value;
            },
            set: (newVal) => {
                if(newVal === value) return;
                console.log('set', key, value);
                this.observer(newVal);
                value = newVal;
                dep.notify();
            }
        })
    }
}

// 模版 template, 将模版中使用的data 部分的变量和模版绑定
class Compiler{
    constructor(el, vm){
        this.el = this.isElementNode(el) ? el : document.querySelector(el);
        this.vm = vm;

        const fragment = this.compileFragment(this.el);

        this.compiler(fragment)

        this.el.appendChild(fragment)
    }
    compiler(fragment){
        const childNodes = Array.from(fragment.childNodes);
        childNodes.forEach(childNode=>{
            // console.dir(childNode)
            if(this.isElementNode(childNode)){
                // 标签节点
                // console.log('标签', childNode)
                this.compilerElement(childNode)
            }else if(this.isTextNode(childNode)){
                // 文本节点
                // console.log('文本节点', childNode)
                this.compilerText(childNode)
            }
            if(childNode.childNodes && childNode.childNodes.length){
                this.compiler(childNode)
            }
        })        
    }
    compileFragment(el){
        const f = document.createDocumentFragment();
        let firstChild;
        while(firstChild = el.firstChild){
            f.appendChild(firstChild)
        }
        // console.dir(f)
        return f;
    }
    // 编译标签节点
    compilerElement(node){
        // v-model v-text v-on:click
        const attributes = Array.from(node.attributes);
        attributes.forEach( attr => {
            const { name, value } = attr;
            // console.log('attr', name, value);
            if(this.isDirector(name)){
                // 指令 v-model v-text v-on:click
                const [, directive] = name.split('-');
                console.log(directive, value);
                const [compileKey, eventName] = directive.split(':');
                utils[compileKey](node, value, this.vm, eventName)
            } else if(this.isEventName(name)){
                // @方法
                const [,eventName] = name.split('@');
                utils['on'](node, value, this.vm, eventName);

            }
        })
    }
    // 编译文本节点
    compilerText(node){
        // {{msg}}
        const content = node.textContent;
        if(/\{\{(.+)\}\}/.test(content)){
            console.log(content);
            utils['text'](node, content, this.vm)
        }
    }
    isEventName(name){
        return name.startsWith('@');
    }
    // 是否是指令
    isDirector(name){
        return name.startsWith('v-');
    }
    // 是否是元素节点
    isElementNode(el){
        return el.nodeType === 1;
    }
    // 是否是文本节点
    isTextNode(el){
        return el.nodeType === 3;
    }
}
class Watcher {
    constructor(expr, vm, cb){
        this.expr = expr;
        this.vm = vm;
        this.cb = cb;
        // 通过 getter 对数据绑定，绑定当前的watcher
        this.oldValue = this.getOldValue();
    }
    getOldValue(){
        TARGET = this;
        const oldValue = utils.getValue(this.expr, this.vm);
        TARGET = null;
        return oldValue;
    }
    update(){
        const newValue = utils.getValue(this.expr, this.vm);
        if(newValue !== this.oldValue){
            this.cb(newValue);
        }
    }
}
class Dep {
    constructor(){
        this.collect = [];
    }
    addWatcher(watcher){
        this.collect.push(watcher)
    }
    notify(){
        this.collect.forEach(w=>w.update())
    }
}
const utils = {
    getValue(expr, vm){
        return vm.$data[expr.trim()];
    },
    setValue(expr, vm, newValue){
        vm.$data[expr] = newValue
    },
    textUpdater(node, result){
        node.textContent = result;
    },
    modelUpdater(node, value){
        node.value = value;
    },
    model(node, value, vm){
        const initValue = this.getValue(value, vm);
        new Watcher(value, vm, (newValue)=>{
            this.modelUpdater(node, newValue);
        })
        node.addEventListener('input', (e)=>{
            const newValue = e.target.value;
            this.setValue(value, vm, newValue);
        })
        this.modelUpdater(node, initValue);
    },
    text(node, value, vm){
       let result;
       if(value.includes('{{')){
        result = value.replace(/\{\{(.+)\}\}/g, (...args)=>{
                const expr = args[1];
                new Watcher(expr, vm, (newVal) => {
                    this.textUpdater(node, newVal);
                  })
               return this.getValue(args[1], vm);
           });
       }else {
        // v-text="xxx"
        result = this.getValue(value, vm)
       }
       this.textUpdater(node, result)
    },
    on(node, value, vm, eventName){
        const fn = vm.$options.methods[value];
        node.addEventListener(eventName, fn.bind(vm), false)
    }
}