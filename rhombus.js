
//var app = require('./app')
var _ = require('lodash');
//var schemata = require('./schemata')

/*
All server-side logic for handling requests and keeping track of the points is here.
There is a lot of legacy code involving links.  Don't mind that.  
*/



var points = [] 
var last_point_id = 0 


exports.reset = function(){
  points = [];
  last_point_id = 0;
}

exports.points = points;
exports.last_point_id = last_point_id;

/*  
If the amount of watchers becomes nonzero, this function is called.
It gets all of the points from the database and the last id the server
handed out, and stores them in program memory. It also destroys the old
records
*/
exports.init = function(callback){

  var done = _.after (2, callback);
/*
  schemata.lastid.find(function(err, id){
    if (err) return console.error(err)

    if(last_point_id === undefined){
      last_point_id = 0
    }
    else{
      last_point_id = id[0].last_point_id
    }
    console.log('last_point_id set to:')
    console.log(last_point_id)

    var query = schemata.lastid.remove()
    query.exec()

    done()
  })

  schemata.point.find(function(err, p){
    if(err) return console.error(err)
    points = p

    console.log('returned from points query:')
    console.log(points)
    var query = schemata.point.remove()
    query.exec()

    done()
  })
*/
}

//gets all the original posts
exports.getOriginals = function(callback){
  callback(_.where(points, {original:true}))
}

//gets a point and all connected points
exports.request = function(request_id, callback){
  //console.log('data:')
  //console.log(data)
  console.log('points:')
  console.log(points)
  var point = _.find(points, {point_id:request_id})
  if(point === undefined){
    callback([])
  }
  else{
    callback(_.where(points, {root:point.root}))
  }
  
}

exports.download = function(callback){
  callback(points);
}


exports.requestTopics = function(callback){
  callback(_.where(points, {original:true}))
}

exports.new_point = function(data, callback){
  data.point_id = ++last_point_id

  data.root = data.point_id

  points.push(data);


  var delta = 1

  if(data.flavor == 'quote')
    delta = 0

  a = []
  a = propagate(data, a, delta)

  var parent = _.find(points, {point_id: data.parent})
  if(parent !== undefined){
    data.root = parent.root
    parent.children.push(data.point_id)
  }
    
  var modifiedparent = _.find(a, {point_id:data.parent})

  if(modifiedparent === undefined && parent !== undefined)
    a.push(parent);

  callback(a);
}

//called if amount of watchers becomes 0.  Saves everything to database.
exports.cleanup = function(callback){
  /*
  _.forEach(points, function(point){
    var p = new schemata.point({ 
      username:point.username,
      point_id:point.point_id,
      value:point.value,
      time:point.time,
      flavor:point.flavor,
      text:point.text,
      parent:point.parent,
      children:point.children,
      links:point.links, 
      original:point.original,
      propagated:point.propagated,
      root:point.root
    })
    p.save(function(err, p){
      if (err) return console.error(err)
    })
  })

  var id = new schemata.lastid({
    last_point_id:last_point_id
  })

  id.save(function(err, id){
    if (err) return console.error(err)
  })

*/
  points = []
  callback()

}

/*
Recursive. Takes a point (n), an array (a), the value to be propagated (delta),
and a list of nodes that shouldn't be visited (blacklist).  
All points that have already been visited are added to a.  a is returned at the 
end of the function and sent to all users (currently)
*/

//next
var propagate = function(n, a, delta, blacklist){
  if (n === undefined || _.find(a, n) !== undefined || (blacklist !== undefined && _.find(n, blacklist) !== undefined))
    return a;

  a.push(n);

  if (delta == 0)
    return a;

  n.propagated++;

  /*
  There are six conditions to consider when propagating a value. They are:
  -the value and delta are positive
  -the value is positive and delta is negative, but the absolute value of the value is larger
  -the value is positive and delta is negative, but the absolute value of the value is smaller
  and the three opposite cases

  In all cases the amount of value to propagate can be defined as the amount of change above 0, 
  and I'M PRETTY SURE this function will return that value.  
  */
  var newdelta = pos(n.value + delta) - pos(n.value);

  n.value += delta;

  // blacklist is also a stand-in boolean for letting propagate know if this value increase counts
  // for the node WITHOUT the link in addition to with it.  
  if (blacklist === undefined)
    n.shadow += delta;

  n.modified = true;

  if(n.flavor == 'dissent')
    newdelta = -newdelta
  if(n.flavor == 'comment')
    newdelta = 0
  if(n.flavor == 'quote' || n.flavor == 'link')
    newdelta = delta

  _.forEach(n.links, function(link){
    var node = _.find(points, {point_id:link}); 
    a = propagate(_.find(node, a, delta, blacklist || []));
  })

  var parent = _.find(points, {point_id:n.parent});
  a = propagate(parent, a, newdelta, blacklist)

  return a

}


var pos = function(value){
  if(value > 0)
    return value;
  else
    return 0

}

// Links are tricky.  The first thing to do when a link is made is check to 
// see if a cycle has been created.  This basically means following all parents
// and links and seeing if you end up where you started.  If so, remove the most recent
// of the two linked points and propagate its inverse value through the graph.

// If it's not linked, then after that we need to consider the situation in which they have
// a common parent.  Consider this graph

// A1 -> B
//         > D
// A2 -> C

// And say A1 has a value of 10 and A2 has a value of 4.  When they are linked, the total value
// of both A1 and A2 goes to 14.  This means that B gets +4 propagated to it and C gets +10.  D,
// however, already had both the values of A1 and A2 affecting it, and so logically its value 
// shouldn't increase.  

// So, the solution to this problem for now is to get all the potential recipient of new values 
// from both of the newly linked nodes, and remove all the recipient that have duplicates.  
// We can optimize this later.

function addLink(n){
  //check if link already exists
  var left = _.find(points, {point_id:links[0]});
  var right = _.find(points, {point_id:links[1]});
  if(_.intersection(left.linkhelpers, right.linkhelpers).length != 0){
    console.log('link exists!');
    return;
  }

  //check for a cycle
  if(hasCycle(n.links[0], null, n.point_id) || hasCycle(n.links[1], null, n.point_id)){
    console.log('cycle found!')
    //fixcycle
    return
  }

  //update new-linked nodes to link each other
  left.links.push(right.point_id);
  right.links.push(left.point_id);

  //obtain the blacklist of non-unique recipients
  var nonUnique = getNonUniqueRecipients(n);

  //propogate the values
  var a = [n];
  a = propagate(left, a, right.value, nonUnique);
  a = propagate(right, a, left.value, nonUnique);
  return a;
}

function hasCycle(current_id, last_id, origin_id){
  if(current_id == origin_id)
    return true;
  if(current_id == null)
    return false;

  for(var i = 0; i < points[current_id].links.length; ++i){
    if(points[current_id].links[i] != last_id)
      if(hasCycle(points[current_id].links[i], current_id, link_id))
        return true;
  }

  return hasCycle(points[current_id].parent, current_id, link_id);
}

// fix this at some point.  Jeez.  
function getNonUniqueRecipients(n){
  a = [];
  var recipients = getAllRecipients(n, a);

  var min = recipients[0];
  _.forEach(recipients, function(n){
    if (min > n)
      min = n;
  });

  var bucket = []
  _.forEach(recipients, function(n){
    if (bucket[n-min] === undefined)
      bucket[n-min] = 1;
    else
      bucket[n-min]++;
  })

  var nonUnique = [];
  _.forEach(bucket, function(n){
    if(n !== undefined && n != 1)
      nonUnique.push(n);
  })

  return nonUnique;
}

function getAllRecipients(point_id, a){
  if (point_id === null)
    return a;

  a.push(point_id);

  var node = __.find(points, {point_id: point_id});

  a = getAllRecipients(node.links[0], a);
  a = getAllRecipients(node.links[1], a);

  a = getAllRecipients(node.parent, a);

  return a;
}


/*

function addLink(link_point_id, socket){
  //console.log("=======addLink called!")
  //console.log(link_point_id)
  points[points[link_point_id].links[0]].links.push(link_point_id)
  points[points[link_point_id].links[1]].links.push(link_point_id)

  if(hasCycle(points[link_point_id].links[0], link_point_id, link_point_id) || hasCycle(points[link_point_id].links[1], link_point_id, link_point_id)){
    console.log("cycle found!")

    var most_recent, least_recent;

    if(points[link_point_id].links[0].point_point_id > points[link_point_id].links[1].point_point_id){
      most_recent = points[link_point_id].links[0]
      least_recent = points[link_point_id].links[1]
    }
    else{
      least_recent = points[link_point_id].links[0]
      most_recent = points[link_point_id].links[1]
    }

    points[most_recent].origin_point_id = points[most_recent].parent_point_id
    points[most_recent].parent_point_id = points[least_recent].parent_point_id


  }

  points[link_point_id].CommonParent = findCommonParent(points[link_point_id].links[0], points[link_point_id].links[1])

  syncLinks(link_point_id, socket);

}


function syncLinks(link_point_id, socket){
  var total = points[points[link_point_id].links[0]].value + points[points[link_point_id].links[1]].value
  points[points[link_point_id].links[0]].shadow = points[points[link_point_id].links[0]].value
  points[points[link_point_id].links[1]].shadow = points[points[link_point_id].links[1]].value

  console.log("total = ", total)
  //points[points[link_point_id].links[0]].value = points[points[link_point_id].links[1]].value = total


  //var parent = points[points[link_point_id].links[0]].parent_point_id
  var delta1 = points[points[link_point_id].links[1]].value
  var delta2 = points[points[link_point_id].links[0]].value


  a = []
  a[link_point_id] = link_point_id
  a = propagate(points[link_point_id].links[0], delta1, a, socket, points[link_point_id].CommonParent)

  //var parent = points[points[link_point_id].links[1]].parent_point_id

  propagate(points[link_point_id].links[1], delta2, a, socket, points[link_point_id].CommonParent) 

}

function chaseLink(link_point_id, delta, a, socket){
  if(a[link_point_id] !== undefined)
    return a

  a[link_point_id] = link_point_id
  a = propagate(points[link_point_id].links[1], delta, a, socket)
  return propagate(points[link_point_id].links[0], delta, a, socket)

}

//returns the common parent node or null if it doesn't exist.  
function findCommonParent(first_point_id, second_point_id){
  a = []
  findCommonParentHelper(first_point_id, a)
  return findCommonParentHelper(second_point_id, a)
}

function findCommonParentHelper(point_point_id, a){

  if(point_point_id == null || a[point_point_id] !== undefined) 
    return point_point_id

  a[point_point_id] = point_point_id
  return findCommonParentHelper(points[point_point_id].parent_point_id, a)
}

function hasCycle(current_point_id, last_point_id, link_point_id){
  if(current_point_id == link_point_id)
    return true
  if(current_point_id == null)
    return false

  for(var i = 0; i < points[current_point_id].links.length; ++i){
    if(points[current_point_id].links[i] != last_point_id)
      if(hasCycle(points[current_point_id].links[i], current_point_id, link_point_id))
        return true
  }

  return hasCycle(points[current_point_id].parent_point_id, current_point_id, link_point_id)
}
*/
//archive
/*
      if(num_watchers == 0){
        var lastpoint_id = new mid({
          lastpoint_id:points.getLastId()
        })


      lastpoint_id.save(function(err, lastpoint_id){
          if (err) return console.err(err)
          console.log('saved last point as:')
          console.log(lastpoint_id)
        })
      }


*/


/*
  data.watchers = []

  if(points[data.parent] !== undefined){
    points[data.parent].children.push(data.point_id)
    data.watchers = points[data.parent].watchers
  }
  else{
    data.watchers.push(socket)
  }

  _.forEach(a, function(point){
    _.forEach(point.watchers, function(w){
      var not = _.find(notify, {watcher:w})
      if(not === undefined){
        not = {}
        not.watcher = w
        not.points = []
        notify.push(not)
      }
      not.points.push(point)
    })
    delete point.watchers
  })


  _.forEach(notify, function(chain){
    chain.watcher.emit('update', chain.points)
    _.forEach(chain, function(not){
      if(not.watchers === undefined)
        not.watchers = []
      not.watchers.push(chain.watcher)

    })
  })
*/


/*
  var query_recur = function(err, n, a){
    if(point_id === undefined || _.find(a, {point_id:point_id}) !== undefined)
      return

    mNode.find({point_id:point_id}, function(err, o){
      if (err) return console.error(err);
      console.log('database lookup for id ' + point_id + ' found:')
      console.log(o)
      a.push(o)
      found = o
      _.forEach(found.children, function(child){
        query_recur(child, a)
      })

      query_recur(found.parent, a)

    })
    //console.log('query_recur so far:')
    //console.log(a)
  }


});


*/