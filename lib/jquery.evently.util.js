$.argsToArray = function(args) {
  if (!args.callee) return args;
  var array = [];
  for (var i=0; i < args.length; i++) {
    array.push(args[i]);
  };
  return array;
}
