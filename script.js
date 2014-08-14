// The database to be accessed
RunOrg.db = '1b3wn0015m8';

// The endpoint where the API runs
RunOrg.endpoint = 'https://runorg.local:4443';

// Fixed page size, used to compute offset based on page number. 
var count_per_page = 5;

// Where are we drawing ?
var $chat;

$(function() {

    $chat = $('#chat');
    
    // Right now, the 'render_' functions are called automatically 
    // from within the system. In order to support URLs, you could 
    // use history.pushState and/or the $.address plug-in to 
    // implement a dispatcher layer instead.

    render_chatroom_list();
});

// The last time a token was acquired...
// Reset this value to null when the token expires. 
var token_acquired_on = null;

// Authenticates the specified user-id with the API. 
// Returns a promise which resolves when authentication is done.
//
function authenticate() {

    // Early-out if a token is present and not older than 5 minutes. 
    
    if (token_acquired_on !== null && +new Date() - token_acquired_on < 5 * 60 * 1000) 
    {
	var d = $.Deferred();
	d.resolve(true);
	return d.promise();
    }

    // WARNING: this code computes an HMAC authentication on the client,
    // which obviously leaks the credentials. This should be done on the
    // server instead. 
    
    var key = '74e6f7298a9c2d168935f58c001bad88';
    var keyid = '1b41X0045m8';

    var id = '1b3wy0025m8';
    var date = "2020-12-31T23:59:59Z"; 
    var assertion = "auth:" + id + ":until:" + date;
    
    var sha1 = new jsSHA(assertion,"TEXT");
    var hmac = sha1.getHMAC(key,"HEX","SHA-1","HEX"); 

    // The following section is correct in a production environment, although
    // all the data used for the request should come from the server rather
    // than be hard-coded client-side.

    return RunOrg.Auth.HMAC({
	id     : id,
	expires: date,
	key    : keyid,
	proof  : hmac
    }).then(function() { token_acquired_on = +new Date(); });
}

// Creates an instance of the specified element
//
function el(tag) { 
    return $('<' + tag + '></' + tag + '>');
}

// Renders the list of all chat-rooms
// 
function render_chatroom_list() {

    $chat.empty().addClass('loading');
    authenticate().then(load_chatrooms).then(render_chatrooms);

    function load_chatrooms() { 
	return RunOrg.Chat.List({limit:1000}); 
    }

    function render_chatrooms(list) { 

	$chat.removeClass('loading');

	// A 'new chatroom' button
	el('button')
	    .click(render_create_chatroom)
	    .text('Nouvelle conversation')
	    .appendTo($chat);

	list.forEach(function(chatroom) {
	    
	    // One clickable 'div' for every chatroom, 
	    // clicking visits that chatroom
	    el('div')
		.addClass('chatroom')
		.click(function() { render_chatroom(chatroom.id); })
		.text(chatroom.subject)
		.appendTo($chat);
	});
    }

}

// Renders a 'create chatroom' page
//
function render_create_chatroom() {

    $chat.empty().addClass('loading');
    authenticate().then(load_groups).then(render_form);

    function load_groups() {
	return RunOrg.Group.List({ limit: 100 });
    }

    function render_form(groups) {
	
	$chat.removeClass('loading');

	// Render one checkbox for each possible recipient group

	var $groups = el('div')
	    .addClass('groups')
	    .appendTo($chat);

	groups.forEach(function(group) {

	    if (!group.label) return;

	    var $label = el('label')
		.attr({'for': 'group-' + group.id})
		.text(group.label)
		.appendTo($groups);

	    el('input')
		.attr({
		    'id': 'group-' + group.id,
		    'type': 'checkbox'
		})
		.data('group',group.id)
		.prependTo($label);
	});

	var $subject = el('input')
	    .attr({ "placeholder": "Sujet..." })
	    .appendTo($chat);

	var $submit = el('button')
	    .text('Créer conversation')
	    .click(create_chatroom)
	    .appendTo($chat);

	var $cancel = el('button')
	    .text('Annuler')
	    .click(render_chatroom_list)
	    .appendTo($chat);

	var submitted = false;

	// What happens when the creation button is clicked...
	//
	function create_chatroom() {
	    
	    var subject = $subject.val();	    
	    if (!subject) return; // <-- TODO: display error
	    
	    var recipientGroups = [];
	    $groups.find(':checked').each(function() {
		recipientGroups.push($(this).data('group'));
	    });
	    if (recipientGroups.length == 0) return; // <-- TODO: display error

	    if (submitted) return;
	    submitted = true;
	    $submit.attr({ 'disabled' : 'disabled' });
	    
	    var chatroom = new RunOrg.Chat({
		subject: subject,
		audience: { write: { groups: recipientGroups } }
	    });

	    chatroom.Create().then(function() { render_chatroom(chatroom.id); });
	}
    }    
}

// Renders the contents of chatroom 'id'
//
function render_chatroom(id) {

    var chat = new RunOrg.Chat(id);

    $chat.empty().addClass('loading');
    authenticate().then(load_chat).then(render_chat);

    function load_chat() {
	return chat.Load();
    }

    function render_chat() {
	
	// A heading with the chatroom subject
	el('h1')
	    .text(chat.subject)
	    .appendTo($chat);

	// A div that contains all posts
	var $posts = el('div')
	    .addClass('posts');

	// A 'new post' form
	var $form = el('form')
	    .submit(create_post(chat,'Post',$posts))
	    .appendTo($chat);

	el('textarea')
	    .attr({ 'placeholder' : 'Votre message...' })
	    .appendTo($form);

	el('button')
	    .attr({ 'type': 'submit' })
	    .text('Publier')
	    .appendTo($form);

	$posts
	    .appendTo($chat);
	
	return load_posts(0).then(render_posts_page(0,load_posts,$posts));
    }

    // This dictionary contains the identifiers of all posts already 
    // rendered to the page (to avoid rendering a post multiple times
    // across pagination boundaries)
    var already_on_page = {};

    function load_posts(page) {
	var chat = new RunOrg.Chat(id);
	return chat.Posts({ 
	    limit: count_per_page, 
	    offset: page * count_per_page 
	});
    }

    // Appends a rendering of the specified post to a page
    // 
    function render_post($target,prepend) {
	return function(post) {

	    if (post.id in already_on_page) return;
	    already_on_page[post.id] = true;
	    
	    var $post = el('div')
		.addClass('post');

	    if (prepend) $post.prependTo($target);
	    else $post.appendTo($target);
	    
	    var $author = el('div')
		.addClass('author')
		.appendTo($post);
	    
	    // Author might not be available in people cache, so this
	    // is an async operation...
	    new RunOrg.Person(post.author).Load().then(function(person) {
		$author.text(person.label);
	    });
	    
	    el('div')
		.addClass('date')
		.text(post.time) // <-- TODO: Better date formatting
		.appendTo($post);
	    
	    el('div')
		.addClass('body')
		.html(post.body)
		.appendTo($post);
	    
	    // TODO: 'reply' form and sub-comments
	    
	};
    }

    // Displays a list of posts in the specified target, along with a
    // 'more' button 
    //
    function render_posts_page(page, more, $target) {
	return function(posts) {

	    posts.forEach(render_post($target));

	    if (posts.length == count_per_page) {

		var $more = el('button')
		    .addClass('more')
		    .text('Plus de messages...')
		    .click(show_more)
		    .appendTo($target);

		function show_more() {		  
		    $more.remove();
		    more(page + 1).then(render_posts_page(page + 1,more,$target));    
		}
	    }

	};
    }

    // Called to create a new post (either at top level or as reply)
    //  -> target[method] should be either chat.Post or post.Reply
    //
    // Newly created post is then prepended to the $target
    // 
    function create_post(target,method,$target) {
	return function() {

	    // Here, 'this' is the form.
	    // This function should always return 'false' to prevent the
	    // form from being actually submitted

	    var $form = $(this);

	    var body = $form.find('textarea').val();
	    if (body == '') return false; // <-- TODO: improve error message

	    $form.find('textarea').val('');

	    target[method]({ body: body }).then(function(post) {

		// Auto-subscribe to the posts I create
		// (but don't wait for response from server)
		post.Track(true); 
		post.Load().then(render_post($target,true));

	    });

	    return false; 
	};
    }
}