/**
 * User sign-in/sign-on for Webmaker.org apps
 * 
 * This sso-ux extends the mozilla ux with kaltura sign on.
 */
(function setupUIHandler( window, document, $ ) {

  // make sure jQuery is available to us
  if( !$ ) {
    var jq = document.createElement( "script" );
    jq.src = "https://login.webmaker.org/js/ext/jquery-1.9.1.min.js";
    jq.onload = function() {
      // retry, this time in the knowledge that we have jQuery
      setupUIHandler( window, document, window.jQuery );
    };
    document.head.appendChild( jq );
    return;
  }
  
  // Load kWidget if unset: 
  if ( typeof kWidget.auth === "undefined" ) {
      var kscript = document.createElement( "script" );
      kscript.onload = function() {
          kWidget.auth.getWidget( "hostedAuthWidget", function( userObject ){
              // hide 
              $.each( userObject, function( key, value){
                console.log( "SSO-UX: " + key + " "+ value );
              });
              /** 
               * Map in the user properties: 
               */
              var user = {
                  name: userObject.firstName,
                  // TODO might need to be unique
                  username: userObject.fullName.replace('\s', ''),
                  // TODO might need to be unique
                  id: userObject.partnerId,
                  hash: md5( userObject.email.toLowerCase() ),
                  email: userObject.email
              }
              // login succeeded, show this user as logged in
              // and call the on-page onlogin handler.
              ui.existingMaker( user );
              // Update UI: 
              $( "#webmaker-nav iframe.include-frame" ).addClass( "loggedin" );
              $( "body" ).addClass( "loggedin" );
              navigator.idSSO.app.onlogin( user.email, user.username, user );
              
              // update sign out link: 
              $('#webmaker-nav .signout-link').click(function(){
                  $( '#hostedAuthWidget a').click();
              });
          })
      };
      kscript.src = $('#hostedAuthWidget').attr('data-kalturaKWidgetPath') + 'kWidget/kWidget.auth.js';
      document.head.appendChild( kscript );
  }
  
  // SSO UI handling object
  var ui =  {
    displayLogin: function( userData ) {
      var placeHolder = $( "#identity" ),
          userElement = $( "div.user-name" ),
          html = document.querySelector( "html" );
          lang = html && html.lang ? html.lang : "en-US";

      if ( userData ) {
        $('#hostedAuthWidget').hide();
        $('.user-info .user').show();
        placeHolder.html( '<a href="#">' + userData.name + "</a>" );
        placeHolder.before( "<img src='https://secure.gravatar.com/avatar/" +
                            userData.hash + "?s=26&d=https%3A%2F%2Fstuff.webmaker.org%2Favatars%2Fwebmaker-avatar-44x44.png' alt='" +
                            userData.hash + "'>" );
      } else {
        userElement.html( "<span id='identity'></span>" );
      }
    },
    showNewMakerForm: function( loggedInUser, formAnchor, callback ) {
      /**
       * load in HTML include containing the HTML form
       * display form
       * munge values into form
       * attach submit handlers to the form
       * AJAX post to createMaker API
       * remove form and listeners once everything is sorted
       */

      var $formContainer,
          $formFrag;

      if ( !errMsg ) {
        $( ".row.error-message" ).html( "" );
      }

      var lang = $('html').attr('lang') || "en-US";

      // Remove any new-user panels that may have been introduced by
      // repeated sign in/out actions by a new user.
      $( ".webmaker-create-user" ).remove();

      // Get the new user form from webmaker.org so that a persona-authenticated
      // user can sign up for a webmaker account before being let into the site.
      $.get( "https://login.webmaker.org/" + lang + "/ajax/forms/new_user.html", function( html ) {
        $formContainer = $( html ).appendTo( $( "#webmaker-nav" ) );
        $formContainer.slideDown();
        $formFrag = $( "#sso_create", formAnchor );
        $mailSignUp = $( "#bsd" );

        // form submission requires some validation before being allowed
        $formFrag.submit(function( data ) {
          if( $mailSignUp.is( ":checked" ) ) {
            $.ajax({
              type: "POST",
              url: "https://sendto.mozilla.org/page/s/webmaker",
              data: {
                email: $( "#username" ).val(),
                "custom-1216": 1
              },
              success: function( resp ) {
                return true;
              },
              error: function( resp ) {
                return false;
              }
            });
          }

          // All the data is good - inform the login service (Through
          // the /user route that loginapi sets up) to creat this user,
          // and update the on-page UI after creation with this user's
          // information.
          $.ajax({
            type: "POST",
            url: "https://login.webmaker.org/user",
            headers: {
              "X-CSRF-Token": csrfMeta.content  // express.js uses a non-standard name for csrf-token
            },
            dataType: "json",
            data: {
              "email": loggedInUser,
              "username": $formContainer.find( "#username" ).val()
            },
            success: function(resp) {
              ui.existingMaker({
                name: resp.user.username,
                hash: resp.user.emailHash
              });
              $formContainer.slideUp();
              callback( null, loggedInUser, resp.user.username );
            },
            error: function( resp ) {
              var error = JSON.parse( resp.responseText ).error;

              // SUPERHACKEY!
              // TODO: Update error handling in sso-ux || https://bugzilla.mozilla.org/show_bug.cgi?id=916149
              // An error object, containing an array `username`, indicates
              // the name is taken.
              // Otherwise, `error` contains a string with error details
              callback( error.username && error.username[0] || error, $( "#username" ).val() );
              return false;
            }
          });
          return false;
        });
      });
    },
    existingMaker: function( userData ) {
      /**
       * API call to the getUserData API
       * display logged in user data in the UI (where to be defined)
       */
      ui.displayLogin( userData );
    },
    loggedOut: function() {
      /**
       * remove logged in user data from the UI
       * remove any listeners we have attached
       */
      ui.displayLogin();
      $( ".webmaker-create-user" ).slideUp();
    }
  };

  // User-defined login/logout handling
  var noop = function(){};
  navigator.idSSO.app = navigator.idSSO.app || {};
  navigator.idSSO.app.onlogin = navigator.idSSO.app.onlogin || noop;
  navigator.idSSO.app.onlogout = navigator.idSSO.app.onlogout || noop;


  // Which button do we show?
  var emailMeta = document.querySelector( "meta[name='persona-email']" ),
      cookieEmail = emailMeta.content ? emailMeta.content : "",
      loggedIn = !!cookieEmail,
      csrfMeta = document.querySelector( "meta[name='csrf-token']" ),
      errMsg;


  // MONKEY PATCH FOR PRODUCTION TRANSITION FROM X-CSRF-TOKEN TO CSRF-TOKEN -- SEE BUG https://bugzilla.mozilla.org/show_bug.cgi?id=941205
  if (!csrfMeta) {
    csrfMeta = document.querySelector( "meta[name='X-CSRF-Token']" );
  }
  // MONKEY PATCH FOR PRODUCTION TRANSITION FROM X-CSRF-TOKEN TO CSRF-TOKEN -- SEE BUG https://bugzilla.mozilla.org/show_bug.cgi?id=941205


  // Start listening for Persona events
/*navigator.idSSO.watch({
    // Note: 'loggedInUser:cookieEmail' yet, see https://bugzilla.mozilla.org/show_bug.cgi?id=872710
    onlogin: function( assertion ) {
      $.ajax({
        type: "POST",
        url: "/persona/verify",
        headers: {
          "X-CSRF-Token": csrfMeta.content // express.js uses a non-standard name for csrf-token
        },
        data: { assertion: assertion },
        success: function( res, status, xhr ) {
          // login succeeded, show this user as logged in
          // and call the on-page onlogin handler.
          ui.existingMaker({
            name: res.user.username,
            hash: res.user.emailHash
          });
          $( "#webmaker-nav iframe.include-frame" ).addClass( "loggedin" );
          $( "body" ).addClass( "loggedin" );
          navigator.idSSO.app.onlogin( res.email, res.user.username, res.user );
        },
        error: function( xhr, status, err ) {
          var error = JSON.parse( xhr.responseText );

          function onNewMakerSubmitted ( err, loggedInUser, displayName ) {
            // hook-out to the owning page, so that it can perform a
            // webmaker-loginAPI lookup, allowing it to bind the user's
            // email and webmaker ID in its req.session.[...]
            if ( err ) {
              errMsg = err;
              // Username existed
              if ( err.code === "ER_DUP_ENTRY" ) {
                $( ".row.error-message" ).html( "Another user has already claimed <strong>" + loggedInUser + "</strong>!" );
                return;
              } else {
                $( ".row.error-message" ).html( err );
                return;
              }
            }
            $.ajax({
              type: "POST",
              url: "/persona/verify",
              headers: {
                "X-CSRF-Token": csrfMeta.content
              },
              data: { assertion: assertion },
              success: function( res, status, xhr ) {
                // login succeeded, show this user as logged in
                // and call the on-page onlogin handler.
                errMsg = null;
                $( "#webmaker-nav iframe.include-frame" ).addClass( "loggedin" );
                $( "body" ).addClass( "loggedin" );
                navigator.idSSO.app.onlogin( loggedInUser, displayName, res.user );
              },
              error: function( xhr, status, err ) {
                errMsg = err;
                navigator.idSSO.logout();
              }
            });
          }

          if( xhr.status === 404 && error.status === "failure" ) {
            ui.showNewMakerForm( error.email, $( "#webmaker-nav" ), onNewMakerSubmitted );
          } else {
            errMsg = err;
            navigator.idSSO.logout();
          }
        }
      });
    },
    onlogout: function() {
      ui.loggedOut();
      $('body').removeClass( "loggedin" );
      $( "#webmaker-nav iframe.include-frame" ).removeClass( "loggedin" );
      // make sure the page does whatever it needs to,
      navigator.idSSO.app.onlogout( errMsg );
      errMsg = null;
      // and make sure the app knows we're logged out.
      $.ajax({
        type: "POST",
        url: "/persona/logout",
        headers: {
          "X-CSRF-Token": csrfMeta.content // express.js uses a non-standard name for csrf-token
        },
        async: true
      });
    }
  });
*/
  
  /**
   * MD5 support for gravatar
   */
  function md5cycle(x, k) {
    var a = x[0], b = x[1], c = x[2], d = x[3];

    a = ff(a, b, c, d, k[0], 7, -680876936);
    d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819);
    b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897);
    d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341);
    b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416);
    d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063);
    b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682);
    d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290);
    b = ff(b, c, d, a, k[15], 22, 1236535329);

    a = gg(a, b, c, d, k[1], 5, -165796510);
    d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713);
    b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691);
    d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335);
    b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438);
    d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961);
    b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467);
    d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473);
    b = gg(b, c, d, a, k[12], 20, -1926607734);

    a = hh(a, b, c, d, k[5], 4, -378558);
    d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562);
    b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060);
    d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632);
    b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174);
    d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979);
    b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487);
    d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520);
    b = hh(b, c, d, a, k[2], 23, -995338651);

    a = ii(a, b, c, d, k[0], 6, -198630844);
    d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905);
    b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571);
    d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523);
    b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359);
    d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380);
    b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070);
    d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259);
    b = ii(b, c, d, a, k[9], 21, -343485551);

    x[0] = add32(a, x[0]);
    x[1] = add32(b, x[1]);
    x[2] = add32(c, x[2]);
    x[3] = add32(d, x[3]);

  }

  function cmn(q, a, b, x, s, t) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }

  function ff(a, b, c, d, x, s, t) {
    return cmn((b & c) | ((~b) & d), a, b, x, s, t);
  }

  function gg(a, b, c, d, x, s, t) {
    return cmn((b & d) | (c & (~d)), a, b, x, s, t);
  }

  function hh(a, b, c, d, x, s, t) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }

  function ii(a, b, c, d, x, s, t) {
    return cmn(c ^ (b | (~d)), a, b, x, s, t);
  }

  function md51(s) {
    txt = '';
    var n = s.length, state = [1732584193, -271733879, -1732584194,
        271733878], i;
    for (i = 64; i <= s.length; i += 64) {
      md5cycle(state, md5blk(s.substring(i - 64, i)));
    }
    s = s.substring(i - 64);
    var tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (i = 0; i < s.length; i++)
      tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
    if (i > 55) {
      md5cycle(state, tail);
      for (i = 0; i < 16; i++)
        tail[i] = 0;
    }
    tail[14] = n * 8;
    md5cycle(state, tail);
    return state;
  }

  /* there needs to be support for Unicode here,
   * unless we pretend that we can redefine the MD-5
   * algorithm for multi-byte characters (perhaps
   * by adding every four 16-bit characters and
   * shortening the sum to 32 bits). Otherwise
   * I suggest performing MD-5 as if every character
   * was two bytes--e.g., 0040 0025 = @%--but then
   * how will an ordinary MD-5 sum be matched?
   * There is no way to standardize text to something
   * like UTF-8 before transformation; speed cost is
   * utterly prohibitive. The JavaScript standard
   * itself needs to look at this: it should start
   * providing access to strings as preformed UTF-8
   * 8-bit unsigned value arrays.
   */
  function md5blk(s) { /* I figured global was faster.   */
    var md5blks = [], i; /* Andy King said do it this way. */
    for (i = 0; i < 64; i += 4) {
      md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8)
          + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
    }
    return md5blks;
  }

  var hex_chr = '0123456789abcdef'.split('');

  function rhex(n) {
    var s = '', j = 0;
    for (; j < 4; j++)
      s += hex_chr[(n >> (j * 8 + 4)) & 0x0F]
          + hex_chr[(n >> (j * 8)) & 0x0F];
    return s;
  }

  function hex(x) {
    for (var i = 0; i < x.length; i++)
      x[i] = rhex(x[i]);
    return x.join('');
  }

  function md5(s) {
    return hex(md51(s));
  }

  /* this function is much faster,
  so if possible we use it. Some IEs
  are the only ones I know of that
  need the idiotic second function,
  generated by an if clause.  */

  function add32(a, b) {
    return (a + b) & 0xFFFFFFFF;
  }

  if (md5('hello') != '5d41402abc4b2a76b9719d911017c592') {
    function add32(x, y) {
      var lsw = (x & 0xFFFF) + (y & 0xFFFF), msw = (x >> 16) + (y >> 16)
          + (lsw >> 16);
      return (msw << 16) | (lsw & 0xFFFF);
    }
  }
  
}( window, document, window.jQuery ) );