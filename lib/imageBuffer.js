/*
 * Name: 图片预存（缓存）工具
 * Version: 1.0.0
 * Author:  Maple Jan
 * Date:    2014-04-01
 * */
;(function (window, document) {
    var imageBuffer = function () {
        var nope = function () {};

        /**
         * Config类，用于初始化配置参数
         * @param       {Object}    opt             配置参数
         * @p-config    {Array}     resource        图片url列表
         * @p-config    {String}    type            加载方式
         * @p-config    {Number}    num             best模式下，单次并行加载的图片数量
         * @p-config    {Number}    timeout         超时时间
         * @p-config    {Function}  load(e)         单张图片加载成功callback
         * @p-config    {Function}  complete(e)     全部图片加载完成callback
         * @p-config    {Function}  error(e)        单张图片加载失败callback
         *
         * @constructor
         */
        function Config(opt) {
            this.resource = opt.resource || [];

            // param: parallel, serial, best
            this.type = opt.type || 'best';
            this.num = opt.num || 5;
            this.timeout = opt.timeout || 0;

            this.loadCallback = opt.load || nope;
            this.completeCallback = opt.complete || nope;
            this.errorCallback = opt.error || nope;

            if (this.resource.length < this.num) {
                this.num = this.resource.length
            }

            this._notCompleteCallback = function () {};
        }

        /**
         * ImageList类，用于创建一个图片加载的状态机
         * @param   {Array}     resource    图片url列表
         * @constructor
         */
        function ImageList(resource) {
            var token = '_imageBuffer' + 1 * new Date();

            this.urls = resource;
            this.elements = [];
            this.total = resource.length;
            this.loaded = 0;

            // 避免部分浏览器因GC回收 imageList
            window[token] = this.elements;

            this.clear = function () {
                //console.log(token);
                window[token] = null;
            }
        }

        /**
         * Timeout类，用于创建一个超时控制器
         * @param   {Object}    callback    回调
         * @param   {Number}    time        超时时间
         * @constructor
         */
        function Timeout(callback, time) {
            this.target = null;
            this.clear = nope;
            if (time) {
                this.target = setTimeout(function () {
                    //console.warn('timeout');
                    callback();
                }, time);
                this.clear = function () {
                    //console.warn('clearTimeout');
                    clearTimeout(this.target);
                }
            }
        }

        /**
         * 图片加载方法
         * @param   {Object}        config
         * @param   {ImageList}     imageList
         * @param   {Number}        index
         */
        function imageLoad(config, imageList, index) {
            imageList.loaded++;

            var _e = {
                target: imageList.elements[index],
                loaded: imageList.loaded,
                total: imageList.total
            };

            config.loadCallback(_e);
            if (imageList.loaded === imageList.total) {
                imageList.clear();
                _e.target = imageList.elements;
                config.completeCallback(_e);
            } else {
                config._notCompleteCallback(_e);
            }
        }

        /**
         *
         * @param   {Object}        config
         * @param   {ImageList}     imageList
         * @param   {Number}        index
         * @param   {Number}        reloadTimes
         * @param   {Number}        maxReloadTimes
         */
        function imageError(config, imageList, index, reloadTimes, maxReloadTimes) {
            if (reloadTimes++ < maxReloadTimes) {
                var _e = {
                    target: imageList.elements[index],
                    loaded: imageList.loaded,
                    total: imageList.total
                };
                config.errorCallback(_e);
                imageList.elements[index] = new Image();
                imageList.elements[index].onload = function () {
                    imageLoad(config, imageList, index);
                };
                imageList.elements[index].onerror = function() {
                    imageError(config, imageList, index, reloadTimes, maxReloadTimes);
                };
                imageList.elements[index].src = config.resource[index];
            } else {
                imageLoad(config, imageList, index);
            }
        }

        /**
         * 并行加载模式
         */
        function parallelMode() {
            var config = arguments[0] || {},
                imageList = arguments[1] || {};

            for (var i = 0; i < imageList.total; i++) {
                imageList.elements[i] = new Image();

                imageList.elements[i].onload = function (i) {
                    var index = i;
                    return function() {
                        imageLoad(config, imageList, index);
                    }
                }(i);

                imageList.elements[i].onerror = function (i) {
                    var index = i,
                        reloadTimes = 0,
                        maxReloadTimes = 3;     // 重复请求3次
                    return function() {
                        imageError(config, imageList, index, reloadTimes, maxReloadTimes);
                    };
                }(i);

                imageList.elements[i].src = config.resource[i];
            }
        }

        /**
         * 串行加载模式
         */
        function serialMode() {
            var config = arguments[0] || {},
                imageList = arguments[1] || {},
                i = 0;

            function action() {
                imageList.elements[i] = new Image();

                imageList.elements[i].onload = function (i) {
                    var index = i;
                    return function() {
                        imageLoad(config, imageList, index);
                    }
                }(i);

                imageList.elements[i].onerror = function (i) {
                    var index = i,
                        reloadTimes = 0,
                        maxReloadTimes = 3;     // 重复请求3次
                    return function() {
                        imageError(config, imageList, index, reloadTimes, maxReloadTimes);
                    };
                }(i);

                imageList.elements[i].src = config.resource[i];
            }

            config._notCompleteCallback = function () {
                i++;
                action();
            };

            action();
        }

        /**
         * best加载模式
         */
        function bestMode() {
            var config = arguments[0] || {},
                imageList = arguments[1] || {},
                i = 0;

            function action() {
                var timeout = new Timeout(next, config.timeout);

                imageList.elements[i] = new Image();

                imageList.elements[i].onload = function (i) {
                    var index = i;
                    return function() {
                        timeout.clear();
                        //console.log(imageList.loaded);
                        imageLoad(config, imageList, index);
                        next();
                    }
                }(i);

                imageList.elements[i].onerror = function (i) {
                    var index = i,
                        reloadTimes = 0,
                        maxReloadTimes = 3;     // 重复请求3次
                    return function() {
                        timeout.clear();
                        imageError(config, imageList, index, reloadTimes, maxReloadTimes);
                        next();
                    };
                }(i);

                imageList.elements[i].src = config.resource[i];

            }

            function next(error) {
                if (i < imageList.total) {
                    action();
                    i++;
                }
            }

            for (; i < config.num; i++) {
                action();
            }
        }

        return function (opt) {
            var config = new Config(opt),
                imageList = new ImageList(config.resource);
                
                
            if (config.resource.length === 0) {
                config.completeCallback();
                return false;
            }

            switch (config.type) {
                case 'best':
                    bestMode(config, imageList);
                    break;
                case 'parallel':
                    parallelMode(config, imageList);
                    break;
                case 'serial':
                    serialMode(config, imageList);
                    break;

                default :
                    break;
            }
            return true;
        }
    }();

    window.imageBuffer = imageBuffer;
})(window, document);
