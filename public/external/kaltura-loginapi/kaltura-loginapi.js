/**
 * Kaltura loginapi
 */

/*module.exports = function( app, options ) {
  module.exports = require("kaltura-loginapi")( app, options );
};*/
/**
 *  Module.exports
 **/
module.exports = function ( app, options ) {
  options = options || {};
  debugger;
  if ( !app ) {
    throw new Error("webmaker-loginapi error: express app was not passed into function");
  }

  if ( !options.loginURL ) {
    throw new Error("webmaker-loginapi error: URI was not passed into function");
  }

  var parsedUrl = require( "url" ).parse( options.loginURL );

  if ( parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:" ) {
    throw new Error( "webmaker-loginapi error: URI protocol must be 'https:' or 'http:'" );
  }
  if ( !parsedUrl.auth || parsedUrl.auth.split( ":" ).length != 2 ) {
    throw new Error( "webmaker-loginapi error: authentication must be present in URI" );
  }

  var authBits = parsedUrl.auth.split( ":" ),
      webmakerUrl = parsedUrl.href;

  authBits = {
    user: authBits[ 0 ],
    pass: authBits[ 1 ]
  };

  function userRequest( query, field, callback ) {
    request({
      auth: {
        username: authBits.user,
        password: authBits.pass,
        sendImmediately: true
      },
      method: "GET",
      uri: webmakerUrl + "user/" + field + query,
      json: true
    }, function( error, response, body ) {
      // Shallow error check
      if ( error ) {
        return callback( error );
      }

      // User account wasn't found. Treat differently
      if ( response.statusCode === 404 ) {
        return callback();
      }

      // If we get a 503, or otherwise fail to get a body back from the login
      // server, treat that as an error and bail now.
      if ( !body ) {
        return callback( "Error requesting user, server returned nothing." );
      }

      // Deep error check
      if ( body && body.error ) {
        return callback( body.error );
      }

      // Auth error check
      if ( response.statusCode == 401 ) {
        return callback( "Authentication failed!" );
      }

      callback( null, body.user );
    });
  }

  var loginAPI = {
    getUserById: function ( id, callback ) {
      userRequest( id, "id/", callback );
    },
    getUserByUsername: function ( username, callback ) {
      userRequest( username, "username/", callback );
    },
    getUserByEmail: function ( email, callback ) {
      userRequest( email, "email/", callback );
    }
  };

  var personaOpts = {
    verifyResponse: function( error, req, res, email ) {
      if ( error ) {
        return res.json( { status: "failure", reason: error } );
      }

      loginAPI.getUserByEmail( email, function( err, webmaker ) {

        if ( err ) {
          return res.json( 500, {
            status: "failure",
            reason: err,
            email: email
          });
        }

        if ( !webmaker ) {
          return res.json( 404, {
            status: "failure",
            reason: "webmaker not found",
            email: email
          });
        }

        // Set session
        req.session.username = webmaker.username;
        req.session.id = webmaker.id;
        if ( options.verifyResponse ) {
          options.verifyResponse( res, {
            status: "okay",
            user: webmaker,
            email: email
          });
          return;
        }

        return res.json( 200, {
          status: "okay",
          user: webmaker,
          email: email
        });
      });
    },
    logoutResponse: function( error, req, res ) {
      delete req.session.username;
      delete req.session.id;

      if ( error ) {
        return res.json( { status: "failure", reason: error } );
      }

      res.json( { status: "okay" } );
    }
  };

  Object.keys(options).forEach( function( key ) {
    if ( !personaOpts[ key ] ) {
      personaOpts[ key ] = options[ key ];
    }
  });

  persona( app, personaOpts );

  return {
    Fogin: Fogin,
    getUserById: loginAPI.getUserById,
    getUserByUsername: loginAPI.getUserByUsername,
    getUserByEmail: loginAPI.getUserByEmail
  };
};
