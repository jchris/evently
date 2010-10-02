// $$ inspired by @wycats: http://yehudakatz.com/2009/04/20/evented-programming-with-jquery/
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
  // utility functions used in the implementation
  
  function forIn(obj, fun) {
    var name;
    for (name in obj) {
      if (obj.hasOwnProperty(name)) {
        fun(name, obj[name]);
      }
    }
  };
  $.forIn = forIn;
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

  $.evently = {
    connect : function(source, target, events) {
      events.forEach(function(ev) {
        $(source).bind(ev, function() {
          var args = $.makeArray(arguments);
          // remove the original event to keep from stacking args extra deep
          // it would be nice if jquery had a way to pass the original
          // event to the trigger method.
          args.shift();
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
    }
  };
  
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
    forIn(events, function(name, h) {
      eventlyHandler(elem, name, h, args);
    });
    
    if (events._init) {
      elem.trigger("_init", args);
    }
    
    if (app && events._changes) {
      $("body").bind("evently-changes-"+app.db.name, function() {
        elem.trigger("_changes");        
      });
      followChanges(app);
      elem.trigger("_changes");
    }
  };
  
  // eventlyHandler applies the user's handler (h) to the 
  // elem, bound to trigger based on name.
  function eventlyHandler(elem, name, h, args) {
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
        eventlyHandler(elem, name, h[i], args);
      }
    } else {
      // an object is using the evently / mustache template system
      if (h.fun) {
        throw("e.fun has been removed, please rename to e.before")
      }
      // templates, selectors, etc are intepreted
      // when our named event is triggered.
      elem.bind(name, {args:args}, function() {
        renderElement($(this), h, arguments);
        return false;
      });
    }
  };

  function renderElement(me, h, args, ran) {
    ran = ran || {};
    var fun, name, before = $.evently.fn.before;
    for (name in before) {
      if (before.hasOwnProperty(name)) {
        if (h[name] && !ran[name]) {
          ran[name] = true;
          var cb = function() {
            renderElement(me, h, 
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
  

  
  // this is for the items handler
  // var lastViewId, highKey, inFlight;
  // this needs to key per elem
  function newRows(elem, app, view, opts) {
    // $.log("newRows", arguments);
    // on success we'll set the top key
    var thisViewId, successCallback = opts.success, full = false;
    function successFun(resp) {
      // $.log("newRows success", resp)
      $$(elem).inFlight = false;
      var JSONhighKey = JSON.stringify($$(elem).highKey);
      resp.rows = resp.rows.filter(function(r) {
        return JSON.stringify(r.key) != JSONhighKey;
      });
      if (resp.rows.length > 0) {
        if (opts.descending) {
          $$(elem).highKey = resp.rows[0].key;
        } else {
          $$(elem).highKey = resp.rows[resp.rows.length -1].key;
        }
      };
      if (successCallback) {successCallback(resp, full)};
    };
    opts.success = successFun;
    
    if (opts.descending) {
      thisViewId = view + (opts.startkey ? JSON.stringify(opts.startkey) : "");
    } else {
      thisViewId = view + (opts.endkey ? JSON.stringify(opts.endkey) : "");
    }
    // $.log(["thisViewId",thisViewId])
    // for query we'll set keys
    if (thisViewId == $$(elem).lastViewId) {
      // we only want the rows newer than changesKey
      var hk = $$(elem).highKey;
      if (hk !== undefined) {
        if (opts.descending) {
          opts.endkey = hk;
          // opts.inclusive_end = false;
        } else {
          opts.startkey = hk;
        }
      }
      // $.log("add view rows", opts)
      if (!$$(elem).inFlight) {
        $$(elem).inFlight = true;
        app.view(view, opts);
      }
    } else {
      // full refresh
      // $.log("new view stuff")
      full = true;
      $$(elem).lastViewId = thisViewId;
      $$(elem).highKey = undefined;
      $$(elem).inFlight = true;
      app.view(view, opts);
    }
  };
  
  // only start one changes listener per db
  function followChanges(app) {
    var dbName = app.db.name, changeEvent = function(resp) {
      $("body").trigger("evently-changes-"+dbName, [resp]);
    };
    if (!$.evently.changesDBs[dbName]) {
      if (app.db.changes) {
        // new api in jquery.couch.js 1.0
        app.db.changes(null, $.evently.changesOpts).onChange(changeEvent);
      } else {
        // in case you are still on CouchDB 0.11 ;) deprecated.
        connectToChanges(app, changeEvent);
      }
      $.evently.changesDBs[dbName] = true;
    }
  }
  $.evently.followChanges = followChanges;
  // deprecated. use db.changes() from jquery.couch.js
  // this does not have an api for closing changes request.
  function connectToChanges(app, fun, update_seq) {
    function changesReq(seq) {
      var url = app.db.uri+"_changes?heartbeat=10000&feed=longpoll&since="+seq;
      if ($.evently.changesOpts.include_docs) {
        url = url + "&include_docs=true";
      }
      $.ajax({
        url: url,
        contentType: "application/json",
        dataType: "json",
        complete: function(req) {
          var resp = $.httpData(req, "json");
          fun(resp);
          connectToChanges(app, fun, resp.last_seq);
        }
      });
    };
    if (update_seq) {
      changesReq(update_seq);
    } else {
      app.db.info({success: function(db_info) {
        changesReq(db_info.update_seq);
      }});
    }
  };

  $.evently.fn = {
    before : {},
    render : {},
    after : {}
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


// CouchDB specific code

// query plugin
(function($) {  
  function runQuery(me, h, args) {
    // $.log("runQuery: args", args)
    var app = $$(me).app;
    var qu = $.evently.utils.rfun(me, h.query, args);
    var qType = qu.type;
    var viewName = qu.view;
    var userSuccess = qu.success;
    // $.log("qType", qType)
    
    var q = {};
    $.forIn(qu, function(k, v) {
      if (["type", "view"].indexOf(k) == -1) {
        q[k] = v;
      }
    });
    
    if (qType == "newRows") {
      q.success = function(resp) {
        // $.log("runQuery newRows success", resp.rows.length, me, resp)
        resp.rows.reverse().forEach(function(row) {
          renderElement(me, h, [row].concat($.argsToArray(args)), true)
        });
        if (userSuccess) userSuccess(resp);
      };
      newRows(me, app, viewName, q);
    } else {
      q.success = function(resp) {
        // $.log("runQuery success", resp)
        renderElement(me, h, [resp].concat($.argsToArray(args)), true);
        userSuccess && userSuccess(resp);
      };
      // $.log(app)
      app.view(viewName, q);      
    }
  }
  
  
  $.evently.fn.before.query = function(h, cb, args) {
    var app = $$(this).app
      , qu = $.evently.utils.rfun(this, h.query, args)
      , qType = qu.type
      , viewName = qu.view
      , userSuccess = qu.success
      , q = {}
      ;
    $.forIn(qu, function(k, v) {
      if (["type", "view"].indexOf(k) == -1) {
        q[k] = v;
      }
    });
    if (qType == "newRows") {
      q.success = function(resp) {
        // $.log("runQuery newRows success", resp.rows.length, me, resp)
        resp.rows.reverse().forEach(cb);
        if (userSuccess) userSuccess(resp);
      };
      newRows(this, app, viewName, q);
    } else {
      q.success = function(resp) {
        // $.log("runQuery success", resp)
        cb(resp);
        userSuccess && userSuccess(resp);
      };
      app.view(viewName, q);      
    }
  };
})(jQuery);


