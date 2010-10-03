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

  // Now, real code we need to have to run:

  // this allows you to specify callbacks as functions or strings
  function evfun(fun, hint) {
    if (fun && fun.match && fun.match(/^function/)) {
      eval("var f = "+fun);
      if (typeof f == "function") {
        return function() {
          try {
            return f.apply(this, arguments);
          } catch(e) {
            // IF YOU SEE AN ERROR HERE IT HAPPENED WHEN WE TRIED TO RUN YOUR FUNCTION
            $.log({"message": "Error in evently function.", "error": e, 
              "src" : fun, "hint":hint});
            throw(e);
          }
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
  // combine w above
  function extractPartials(ddoc) {
    var partials = [true, {}]
      , vendor = ddoc.vendor || {}
      , evently = ddoc.evently || {}
      ;
    $.forIn(vendor, function(k, v) {
      if (v.evently && v.evently._partials) {
        partials.push(v.evently._partials);
      }
    });
    if (evently._partials) {partials.push(evently._partials);}
    return $.extend.apply(null, partials);
  };

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
    if ($.evently.log) {
      elem.bind(name, function() {
        $.log(elem, name);
      });
    }
    if (h.path) {
      elem.pathbinder(name, h.path);
    }
    var f = evfun(h, name);
    if (typeof f == "function") {
      elem.bind(name, {args:args}, f); 
    } else if (typeof f == "string") {
      elem.bind(name, {args:args}, function() {
        $(this).trigger(f, arguments);
        return false;
      });
    } else if ($.isArray(h)) { 
      // handle arrays recursively
      for (var i=0; i < h.length; i++) {
        hApply(elem, name, h[i], args);
      }
    } else {
      // an object is using the evently / mustache template system
      // templates, selectors, etc are intepreted
      // when our named event is triggered.
      elem.bind(name, {args:args}, function() {
        react($(this), h, arguments);
        return false;
      });
    }
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
    var rendered;
    $.forIn($.evently.fn.render, function(name, fun) {
      if (h[name]) {
        rendered = fun.apply(me, [h, args]);
      }
    });
    $.forIn($.evently.fn.after, function(name, fun) {
      if (h[name]) {
        fun.apply(me, [h, rendered, args]);
      }
    });
  };
  
  // The public API
  $.fn.evently = function(events, app, args) {
    var elem = $(this);
    // store the app on the element for later use
    if (app) {
      $$(elem).app = app;
    }

    if (typeof events == "string") {
      events = extractEvents(events, app.ddoc);
    }
    events = applyCommon(events);
    $$(elem).evently = events;
    if (app && app.ddoc) {
      $$(elem).partials = extractPartials(app.ddoc);
    }
    // setup the handlers onto elem
    $.forIn(events, function(name, h) {
      hApply(elem, name, h, args);
    });
    
    if (events._init) {
      elem.trigger("_init", args);
    }
    // 
    // if (app && events._changes) {
    //   $("body").bind("evently-changes-"+app.db.name, function() {
    //     elem.trigger("_changes");        
    //   });
    //   followChanges(app);
    //   elem.trigger("_changes");
    // }
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
      before : {},
      render : {},
      after : {}
    }
  };
  
})(jQuery);

// plugin system
// $.evently.handlers
// _init, _changes

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
    var partials = $$(me).partials; // global partials stored by _____
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
      , root = (render == "replace") ? el : rendered
      , el = this, app = $$(el).app
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





