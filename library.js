(function(module) {
	"use strict";

	var User = module.parent.require('./user'),
		Groups = module.parent.require('./groups'),
		meta = module.parent.require('./meta'),
		db = module.parent.require('../src/database'),
		passport = module.parent.require('passport'),
		fs = module.parent.require('fs'),
		path = module.parent.require('path'),
		nconf = module.parent.require('nconf'),
		winston = module.parent.require('winston'),
		async = module.parent.require('async');

	var authenticationController = module.parent.require('./controllers/authentication');

	var InternalOAuthError = module.require('passport-oauth').InternalOAuthError;

	var constants = Object.freeze({
			url: nconf.get('url'),
			name: nconf.get('oauth:service:providerName'),
			linktext: nconf.get('oauth:linktext'),
			icon: nconf.get('oauth:icon'),
			userRoute: nconf.get('oauth:service:url') + nconf.get('oauth:service:userProfilePath'),
			registerURL: nconf.get('oauth:registerlink')+nconf.get('oauth:registercontext'),
			authURL: '/auth/' + nconf.get('oauth:service:providerName'),
			callbackURL: '/auth/' + nconf.get('oauth:service:providerName') + '/callback',
			oauth2: {
				authorizationURL: nconf.get('oauth:client:url') + nconf.get('oauth:client:loginPath'),
				tokenURL: nconf.get('oauth:service:url') + nconf.get('oauth:service:tokenPath'),
				clientID: nconf.get('oauth:id'),
				clientSecret: nconf.get('oauth:secret'),
			},
			scope: 'read'
		}),
		configOk = false,
		OAuth = {};

	if (!constants.name) {
		winston.error('[sso-oauth] Please specify a name for your OAuth provider (library.js:32)');
	} else if (!constants.userRoute) {
		winston.error('[sso-oauth] User Route required (library.js:31)');
	} else {
		configOk = true;
	}

	OAuth.getStrategy = function(strategies, callback) {
		if (configOk) {
			const OAuth2Strategy = require('passport-oauth').OAuth2Strategy;

			OAuth2Strategy.Strategy.prototype.userProfile = function(accessToken, done) {
				let strategy = this;
				strategy._oauth2._useAuthorizationHeaderForGET = true;
				strategy._oauth2.get(constants.userRoute, accessToken, function(err, body, res) {
					if (err) {
						console.error('UserProfileFetchError', err);
						return done(new InternalOAuthError('failed to fetch user profile', err));
					}

					try {
						var json = JSON.parse(body);
						OAuth.parseUserReturn(json, function(err, profile) {
							if (err) return done(err);
							profile.provider = constants.name;

							done(null, profile);
						});
					} catch(e) {
						done(e);
					}
				});
			};


			// OAuth 2 options
			let opts = Object.assign({}, constants.oauth2, {
				passReqToCallback: true,
				callbackURL: constants.url + constants.callbackURL,
			})

			passport.use(constants.name, new OAuth2Strategy(opts, (req, token, secret, profile, done) => {
				OAuth.login({
					oAuthid: profile.id,
					handle: profile.displayName,
					email: profile.emails[0].value,
					isAdmin: profile.isAdmin
				}, (err, user) => {
					if (err) { return done(err); }

					authenticationController.onSuccessfulLogin(req, user.uid);
					done(null, user);
				});
			}));

			strategies.push({
				name: constants.name,
				url: constants.authURL,
				callbackURL: constants.callbackURL,
				icon: constants.icon,
				linktext: constants.linktext,
				registerURL: constants.registerURL,
				scope: (constants.scope || '').split(',')
			});

			callback(null, strategies);
		} else {
			callback(new Error('OAuth Configuration is invalid'));
		}
	};

	/**
	 * Alter this section to include whatever data is necessary
	 * NodeBB *requires* the following: id, displayName, emails.
	 * Everything else is optional.
	 *
	 * Find out what is available by uncommenting this line:
	 * console.log(data);
	 *
	 * For the format of the profile object for passport
	 * see: http://www.passportjs.org/docs/profile/#userprofile
	 */
	OAuth.parseUserReturn = function(data, callback) {
		data.provider = constants.name;
		data.displayName = data.first_name + '' + data.last_name;
		data.name = {
			familyName: data.last_name,
			givenName: data.first_name,
		};
		data.emails = [{ value: data.email_address, type: 'work' }]

		// Do you want to automatically make somebody an admin? This line might help you do that...
		// profile.isAdmin = data.isAdmin ? true : false;

		return callback(null, data);
	}

	OAuth.login = function(payload, callback) {
		OAuth.getUidByOAuthid(payload.oAuthid, function(err, uid) {
			if(err) {
				return callback(err);
			}

			if (uid !== null) { // Existing User
				callback(null, { uid: uid });
			} else { // New User
				var success = function(uid) {
					// Save provider-specific information to the user
					User.setUserField(uid, constants.name + 'Id', payload.oAuthid);
					db.setObjectField(constants.name + 'Id:uid', payload.oAuthid, uid);
					if (payload.isAdmin) {
						Groups.join('administrators', uid, function(err) {
							callback(null, { uid: uid });
						});
					} else {
						callback(null, { uid: uid });
					}
				};

				User.getUidByEmail(payload.email, function(err, uid) {
					if (err) {
						return callback(err);
					}

					if (!uid) {
						let userObject = {
							username: payload.handle,
							email: payload.email
						};
						User.create(userObject, function(err, uid) {
							if (err) {
								callback(err);
							} else {
								success(uid);
							}
						});
					} else {
						success(uid); // Existing account -- merge
					}
				});
			}
		});
	};

	OAuth.getUidByOAuthid = function(oAuthid, callback) {
		db.getObjectField(constants.name + 'Id:uid', oAuthid, function(err, uid) {
			if (err) {
				return callback(err);
			}
			callback(null, uid);
		});
	};

	OAuth.deleteUserData = function(data, callback) {
		async.waterfall([
			async.apply(User.getUserField, data.uid, constants.name + 'Id'),
			function(oAuthIdToDelete, next) {
				db.deleteObjectField(constants.name + 'Id:uid', oAuthIdToDelete, next);
			}
		], function(err) {
			if (err) {
				winston.error('[sso-oauth] Could not remove OAuthId data for uid ' + data.uid + '. Error: ' + err);
				return callback(err);
			}

			callback(null, data);
		});
	};

  // If this filter is not there, the deleteUserData function will fail when getting the oauthId for deletion.
  OAuth.whitelistFields = function(params, callback) {
    params.whitelist.push(constants.name + 'Id');
    callback(null, params);
  };

	module.exports = OAuth;
}(module));
