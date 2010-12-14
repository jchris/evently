// Evently is a macro language for creating template based jQuery apps.
// The strength of Evently is in making widgets that can easily be reused 
// between applications.

// First, some utility functions.
// $$ is inspired by @wycats: http://yehudakatz.com/2009/04/20/evented-programming-with-jquery/
function $$(node) {
  var data = $(node).data("$$");
  if (data) {
    return data;
  } else {
    data = {};
    $(node).data("$$", data);
    return data;
  }
};

(function($) {
  $.log = function(m) {
    if (window && window.console && window.console.log) {
      window.console.log(arguments.length == 1 ? m : arguments);
    }
  };
  $.forIn = function (obj, fun) {
    var name;
    for (name in obj) {
      if (obj.hasOwnProperty(name)) {
        fun(name, obj[name]);
      }
    }
  };
  $.argsToArray = function(args) {
    if (!args.callee) return args;
    var array = [];
    for (var i=0; i < args.length; i++) {
      array.push(args[i]);
    };
    return array;
  }
  $.fn.replace = function(elem) {
    $(this).empty().append(elem);
  };

  // Now, core evently helpers

  // this allows you to specify callbacks as functions or strings
  function evfun(fun, hint) {
    if (fun && fun.match && fun.match(/^function/)) {
      eval("var f = "+fun);
      if (typeof f == "function") {
        return function() {
          try {
            var value = f.apply(this, arguments);
          } catch(e) {
            // IF YOU SEE AN ERROR HERE IT HAPPENED WHEN WE TRIED TO RUN YOUR FUNCTION
            $.log({"message": "Error in evently function.", "error": e, 
              "src" : fun, "hint":hint});
            throw(e);
          }
          
          // _init should not bubble
          if (hint === '_init') return false;
          
          return value;
        };
      }
    }
    return fun;
  };
  function rfun(me, fun, args) {
    // if the field is a function, call it, bound to the widget
    var f = evfun(fun, me);
    if (typeof f == "function") {
      return f.apply(me, args);
    } else {
      return fun;
    }
  }
  
  function extractFrom(name, evs) {
    return evs[name];
  };

  function extractEvents(name, ddoc) {
    // extract events from ddoc.evently and ddoc.vendor.*.evently
    var events = [true, {}]
      , vendor = ddoc.vendor || {}
      , evently = ddoc.evently || {}
      ;
    $.forIn(vendor, function(k, v) {
      if (v.evently && v.evently[name]) {
        events.push(v.evently[name]);
      }
    });
    if (evently[name]) {events.push(evently[name]);}
    return $.extend.apply(null, events);
  }

  function applyCommon(events) {
    if (events._common) {
      $.forIn(events, function(k, v) {
        events[k] = $.extend(true, {}, events._common, v);
      });
      delete events._common;
      return events;
    } else {
      return events;
    }
  }
  
  // hApply applies the user's handler (h) to the 
  // elem, bound to trigger based on name.
  function hApply(elem, name, h, args) {
    if ($.isArray(h)) { 
      for (var i=0; i < h.length; i++) {
        // handle arrays recursively
        hApply(elem, name, h[i], args);
      }
      return;
    }
    var f = evfun(h, name);
    if (typeof f == "function") {
      elem.bind(name, {args:args}, f);
    } else if (typeof f == "string") {
      // just trigger another event
      elem.bind(name, {args:args}, function(e) {
        $(this).trigger(f);
        return false;
      });
    } else {
      // an evently widget
      elem.bind(name, {args:args}, function() {
        react($(this), h, arguments);
        return false;
      });
    }
    // should be a plugin
    // if ($.evently.log) {
    //   elem.bind(name, function() {$.log(elem, name)});
    // }
    // todo make pathbinder plugin
    // if (h.path) {
      // elem.pathbinder(name, h.path);
    // }

  };

  function react(me, h, args, ran) {
    ran = ran || {};
    var fun, name, before = $.evently.fn.before;
    for (name in before) {
      if (before.hasOwnProperty(name)) {
        if (h[name] && !ran[name]) {
          ran[name] = true;
          var cb = function() {
            react(me, h, 
              $.argsToArray(arguments)
                .concat($.argsToArray(args)), ran);
          };
          before[name].apply(me, [h, cb, args]);
          return;
        }
      }
    }
    // result of running multiple render engines is undefined
    // currently the default renderer is mustache
    var rendered;
    $.forIn($.evently.fn.render, function(name, fun) {
      if (h[name]) {
        rendered = fun.apply(me, [h, args]);
      }
    });
    // the after callbacks, like selectors.
    $.forIn($.evently.fn.after, function(name, fun) {
      if (h[name]) {
        fun.apply(me, [h, rendered, args]);
      }
    });
  };
  
  function processEvs(elem, events, app) {
    // store the app on the element for later use
    if (app) {$$(elem).app = app;}
    if (typeof events == "string") {
      events = extractEvents(events, app.ddoc);
    }
    events = applyCommon(events);
    $$(elem).evently = events;
    if (app && app.ddoc) {
      $$(elem).partials = extractEvents("_partials",app.ddoc);
    }
    return events;
  }
  
  
  // The public API
  $.fn.evently = function(events, app, args) {
    var elem = $(this);
    events = processEvs(elem, events, app);
    // setup the handlers onto elem
    $.forIn(events, function(name, h) {
      hApply(elem, name, h, args);
    });
    // the after callbacks, like selectors.
    $.forIn($.evently.fn.setup, function(name, fun) {
      if (events[name]) {
        fun.apply(elem, [events[name], args]);
      }
    });
    return this;
  };
  
  $.evently = {
    connect : function(source, target, events) {
      events.forEach(function(ev) {
        $(source).bind(ev, function() {
          var args = $.makeArray(arguments)
            , e1 = args.shift();
          args.push(e1);
          $(target).trigger(ev, args);
          return false;
        });
      });
    },
    paths : [],
    changesDBs : {},
    changesOpts : {},
    utils : {
      rfun : rfun,
      evfun : evfun
    },
    fn : {
      setup : {},
      before : {},
      render : {},
      after : {}
    }
  };
  
})(jQuery);

// plugin system
// $.evently.handlers
// _init, _changes
(function($) {
  $.evently.fn.setup._init = function(ev, args) {
    this.trigger("_init", args);
  };
})(jQuery);

// before plugin
(function($) {
  $.evently.fn.before.before = function(h, cb, args) {
    $.evently.utils.evfun(h.before, this).apply(this, args);
    cb()
  };
})(jQuery);

// async plugin
(function($) {
  $.evently.fn.before.async = function(h, cb, args) {
    $.evently.utils.evfun(h.async, this).apply(this, [cb].concat($.argsToArray(args)));
  };
})(jQuery);

// Mustache plugin
(function($) {
  var rfun = $.evently.utils.rfun;
  function mustachioed(me, h, args) {
    // global partials stored by processEvs()
    var partials = $$(me).partials; 
    return $($.mustache(
      rfun(me, h.mustache, args),
      rfun(me, h.data, args), 
      rfun(me, $.extend(true, partials, h.partials), args)));
  };
  $.evently.fn.render.mustache = function(h, args) {
    var render = (h.render || "replace").replace(/\s/g,"")
      , newElem = mustachioed(this, h, args);
    this[render](newElem);
    return newElem;
  };
})(jQuery);

// Selectors plugin applies Evently to nested elements
(function($) {
  $.evently.fn.after.selectors = function(h, rendered, args) {
    var render = (h.render || "replace").replace(/\s/g,"")
      , el = this, app = $$(el).app
      , root = (render == "replace") ? el : rendered
      , selectors = $.evently.utils.rfun(el, h.selectors, args)
      ;
    $.forIn(selectors, function(selector, handlers) {
      $(selector, root).evently(handlers, app, args);
    });
  };
})(jQuery);

// plugin to run the after callback
(function($) {
  $.evently.fn.after.after = function(h, rendered, args) {
    $.evently.utils.rfun(this, h.after, args);
  };
})(jQuery);
