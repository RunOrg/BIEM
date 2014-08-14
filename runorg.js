var RunOrg = MakeRunOrg(jQuery);
function MakeRunOrg($) {
// Utility functions

// Fill an object with data from the specified list
//
function fill(obj,data,fields) {

    if (typeof data == "string") data = { id : data };
    data = data || {};
    
    fields.forEach(function(field) {
	obj[field] = data[field] || null;
    });

}

// Keep only the specified fields from the source object
//
function keep(data,fields) {
    var out = {};
    fill(out,data,fields);
    return out;
}

// A constant, successful promise
//
function promise(data) {
    var r = $.Deferred();
    r.resolve(data);
    return r;
}

// Returns the value or its .id (if set)
//
function id(o) {
    if (typeof o == 'object' && o !== null && 'id' in o)
	return o.id;
    return o;
}function now() { return +new Date(); }

    // The last token returned by an authentication method
var token = null, 

    // The 'as' that corresponds to the token (if it is not
    // null).
    as,

    // The clock returned by the last clock-based request
    clock = null,

    // The time when the clock expires. Only used if 'clock' 
    // is not null.
    clock_expiration;

// Perform a request. 
//
// Parameters: 
//   method: one of 'POST', 'GET', 'DELETE' or 'PUT'
//   url: an array that will be joined into the final url
//   query: a key-value dictionary of parameters to be appended to the URL
//   payload: JSON data to be sent (if 'POST' or 'PUT')
//
// Result: 
//   resolve [ status, data ] on success (200, 202, 403, 404) 
//   reject { HTTP: status } on other status
//   reject { error: status } if other failure

function request(method, url, query, payload)
{    
        // The current query string separator
    var sep = '?', 

        // The returned result
        result = $.Deferred(),

        // Key for traversing the query string
        key,

        // The ajax configuration.
        ajax;

    query = query || {};

    if (clock && clock_expiration < now()) clock = null;
    if (typeof url == 'string') url = [url];

    // Construct the url by appending any necessary parameters

    url = RunOrg.endpoint + '/db/' + RunOrg.db + '/' + url.join('/');

    clock && (query.at = clock);
    token && (query.as = as);

    for (key in query) {
	if (query[key] === null) continue;
	url += sep + key + '=' + query[key]; 
	sep = '&';
    }

    // Construct the AJAX config that will be used for the call

    ajax = {
	
	url: url,
	dataType: 'json',
	type: method,

	beforeSend: function(xhr) {
	    token && xhr.setRequestHeader('Authorization','RUNORG token=' + token);
	}
    };

    // If the request has payload ('POST' and 'PUT', not 'GET' and 'DELETE'), add it

    if (method > 'P') {
	ajax.data = JSON.stringify(payload);
	ajax.contentType = 'application/json';
    }

    // Perform the request and parse the result. 

    $.ajax(ajax).always(function(a,status,b) {
	var xhr = ('responseJSON' in a) ? a : b, success = status == 'success';
	if (success && xhr.status < 500) {

	    var data = xhr.responseJSON;

	    // Is there a new clock value returned ? 
	    if ('at' in data) {

	    	var c = clock ? JSON.parse(clock) : {}, i, j, n = c.length, at = data.at;
		
		// Merge the new clock value with the old one
		for (k in at) 
		    if (!(k in c) || c[k] < at[k])
			c[k] = at[k];
		
		clock = JSON.stringify(c);
		clock_expiration = now() + 60000; // <- Assume that it expires after 1 minute
	    }

	    // Is there an authentication value returned ? 
	    if ('token' in data && 'self' in data) {
		token = data.token;
		as    = data.self.id;
	    } 

	    result.resolve(data);
	}
	else
	    result.reject(success ? {HTTP:xhr.status} : {error:status});
    });

    return result.promise();
}function Person(init) {
    fill(this,init,[
	'id',
	'label',
	'gender',
	'pic'
    ]);    
}

Person.prototype = Object.create({

    // Loading a person's data
    // 
    Load: function() {
	var self = this;
	return request("GET", ["people",this.id]).then(function(data) {
	    Person.call(self,data);
	    return Person.Cache(self);
	});
    }

});

// Searching for people by name
// 
Person.Search = function(q, params) {
    params = params || {};
    params.q = q;
    return request("GET", "people/search", keep(params,[ "q", "limit" ])).then(function(data) {
	return data.list.map(Person.Cache);
    });
};

// Listing all people in the database
// 
Person.List = function(params) {
    params = params || {};
    return request("GET", "people", keep(params,[ "limit", "offset" ])).then(function(data) {
	return data.list.map(Person.Cache);
    });
};

// Caching people by their identifier
// 
Person.Cache = function(init) {
    var p = new Person(init);
    person_cache[p.id] = p;
    return p;
};

var person_cache = {};

// Try loading a person from cache
// 
Person.Get = function(id) {
    if (id in person_cache) 
	return promised(person_cache[id]);
    return new Person(id).Load();
};function Group(init) {
    fill(this,init,[
	"id",
	"label",
	"count",
	"audience",
	"access"
    ]);
}

Group.prototype = Object.create({
   
    // Create a group on the server
    // 
    Create: function() {
	var self = this;
	return request("POST","groups",{},keep(this,[ "id", "label", "audience" ])).then(function(data) {
	    Group.call(self,data);
	    return self;
	});
    },

    // List people in the group
    List: function(params) {
	params = params || {};
	return request("GET",["groups",this.id],keep(params,[ "limit", "offset" ])).then(function(data) {
	    return data.list.map(Person.Cache);
	});
    },

    // Load the group information
    //
    Load: function() {
	var self = this;
	return request("GET",["groups",this.id,"info"]).then(function(data) {
	    Group.call(self,data);
	    return self;
	});
    },

    // Save the group information
    //
    Save: function() {
	return request("PUT",["groups",this.id,"info"],{},keep(this,["label", "audience"]));
    },

    // Delete the group from the server
    //
    Delete: function() {
	return request("DELETE",["groups",this.id]);
    },
 
    // Add a single person to this group
    //
    Add: function(person) {
	return this.AddMany([person]);
    },

    // Removes a single person from this group
    //
    Remove: function(person) {
	return this.RemoveMany([person]);
    },

    // Adds many people to this group
    // 
    AddMany: function(people) {
	return request("POST",["groups",this.id,"add"],{},people.map(id));
    },

    // Remove many people from this group
    //
    RemoveMany: function(people) {
	return request("POST",["groups",this.id,"remove"],{},people.map(id));
    },

});

// Load a list of groups from the server
// 
Group.List = function(params) {
    params = params || {};
    return request("GET","groups",keep(params,[ "limit", "offset" ])).then(function(data) {
	return data.list.map(function(init) { return new Group(init); });
    });
};var Auth = {

    Persona: function(assertion) {
	return request("POST","people/auth/persona",{},{assertion:assertion}).then(function(data) {
	    return Person.Cache(data.self);
	});
    },

    HMAC: function(params) {
	params = keep(params,['id','expires','key','proof']);
	return request("POST","people/auth/hmac",{},params).then(function(data) {
	    return Person.Cache(data.self);
	});
    }

};
function Key(init) {
    fill(this,init,[
	'id',
	'key'
    ]);
}

Key.prototype = Object.create({

    // Create a key on the server
    //
    Create: function() {
	var self = this;
	return request("POST","keys",{},{ 
	    key: this.key,
	    hash: 'SHA-1',
	    encoding: 'hex'
	}).then(function(data) {
	    Key.call(self,data);
	    return self;
	});
    }

});
function Token(init) {
    fill(this,init,[
	'id'
    ]);
}

Token.prototype = Object.create({

    // Describe a token's associated person
    //
    Owner: function() {
	return request("GET",["tokens",this.id]).then(function(data) {
	    return Person.Cache(data.self);
	});
    },

    // Delete the token
    // 
    Delete: function() {
	return request("DELETE",["tokens",this.id]);
    }

});
function Post(init) {
    fill(this,init,[
	'id',
	'chat',
	'author',
	'time',
	'body',
	'track',
	'custom',
	'tree'
    ]);

    // Recursively fill the tree
    var tree = this.tree = this.tree || { count: 0, top: [] };
    if (tree.top.length > 0) {
	tree.top = tree.top.map(function(data) { return new Post(data); });
    }
}

Post.prototype = Object.create({

    // Load post data from the server
    //
    Load: function() {
	var self = this;
	return request('GET',['chat',this.chat,'posts',this.id]).then(function(data) {
	    Post.call(self,data.info);
	    data.people.forEach(Person.Cache);
	    return self;
	});
    },

    // Delete the post from the server
    //
    Delete: function() {
	return request('DELETE',['chat',this.chat,'posts',this.id]);
    },

    // Reply to the post
    //
    Reply: function(params) {
	var self = this;
	params = keep(params,['body','custom']);
	params.reply = this.id;
	return request('POST',['chat',this.chat,'posts'],{},params).then(function(data) {
	    return new Chat.Post({ 
		body: params.body, 
		custom: params.custom || null, 
		id: data.id, 
		chat: self.chat
	    });
	});
    },

    // Start (or stop) tracking a post
    //
    Track: function(track) {
	return request('POST',['chat',this.chat,'posts',this.id,'track'],{},track);
    },

    // List replies 
    //
    Replies: function(params) {
	var self = this;
	params = keep(params || {},['limit','offset']);
	params.under = self.id;
	return request('GET',['chat',this.id,'posts'],params).then(function(data) {
	    data.people.forEach(Person.Cache);
	    return data.posts.map(function(post) { 
		post.chat = self.chat; 
		return new Chat.Post(post);
	    });
	});	
    }

});

function Chat(init) {
    fill(this,init,[
	'id',
	'subject',
	'custom',
	'audience',
	'count',
	'last',
	'access',
	'track'
    ]);
}

Chat.prototype = Object.create({

    // Load chat data from the server
    //
    Load: function() {
	var self = this;
	return request('GET',['chat',this.id]).then(function(data) {
	    Chat.call(self,data.info);
	    return self;
	});
    },

    // Update an existing chatroom
    // 
    Save: function() {
	return request('PUT',['chat',this.id],{},keep(this,['subject','custom','audience']));
    },

    // Create a chatroom and retrieve its identifier
    //
    Create: function() {
	var self = this;
	return request('POST','chat',{},keep(this,['subject','custom','audience'])).then(function(data) {
	    self.id = data.id;
	    return self;
	});
    },

    // Delete a chatroom
    //
    Delete: function() {
	return request('DELETE',['chat',this.id]);
    },

    // Start (or stop) tracking a chatroom
    //
    Track: function(track) {
	return request('POST',['chat',this.id,'track'],{},track);
    },

    // Grab a tree of posts from a chatroom
    // 
    Posts: function(params) {
	var self = this;
	params = params || {};
	return request('GET',['chat',this.id,'posts'],keep(params,['limit','offset'])).then(function(data) {
	    data.people.forEach(Person.Cache);
	    return data.posts.map(function(post) { 
		post.chat = self.id; 
		return new Chat.Post(post);
	    });
	});
    },

    // Create a new post in this chatroom
    // 
    Post: function(params) {
	var self = this;
	return request('POST',['chat',this.id,'posts'],{},keep(params,['body','custom'])).then(function(data) {
	    return new Chat.Post({ 
		body: params.body, 
		custom: params.custom || null, 
		id: data.id, 
		chat: self.id
	    });
	});
    }

});

// List all visible chatrooms
//
Chat.List = function(params) {
    params = params || {};
    return request('GET','chat',keep(params,['limit','offset'])).then(function(data) {
	return data.list.map(function(info) { return new Chat(info); });
    });
};

Chat.Post = Post;
  return { 
      Person : Person,
      Group : Group,
      Auth : Auth,
      Key : Key,
      Token : Token,
      Chat : Chat
  };
}