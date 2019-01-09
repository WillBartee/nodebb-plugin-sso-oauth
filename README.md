# NodeBB OAuth SSO

NodeBB Plugin that allows users to login/register via any configured OAuth provider. **Please note** that this is not a complete plugin, but merely a skeleton with which you can create your own OAuth SSO plugin for NodeBB (and hopefully share it with others!)

## How to Adapt

1. Fork this plugin
    * ![](http://i.imgur.com/APWHJsa.png)
1. Add the OAuth credentials (around line 30 of `library.js`)
1. Update profile information (around line 137 of `library.js`) with information from the user API call
1. Activate this plugin from the plugins page
1. Restart your NodeBB
1. Let NodeBB take care of the rest

## Trouble?

Find us on [the community forums](http://community.nodebb.org)!

##### Sample Config file

```JSON
{
    "url": "http://localhost:4567",
    "secret": "somesecret",
    "database": "mongo",
    "mongo": {
        "host": "127.0.0.1",
        "port": "27017",
        "username": "nodebb",
        "password": "nodebb",
        "database": "nodebb",
        "uri": ""
    },
    "port": "4567",
    "oauth": {
      "id": "abc123",
      "secret": "somepassword",
      "linktext": "Click Here to Login With NOVA",
      "registerlink": "http://localhost:4200/sign-up/",
      "registercontext": "ZXlKaGJHY2lPaUpJVXpJMU5pSXN5LmV5SnlaV1JwY21WamRGVnliQ0",
      "icon": "https://nova.cccco.edu/assets/images/favicon.ico",
      "service": {
        "providerName": "nova-service",
        "url": "http://localhost:10010",
        "tokenPath": "/v1/oauth/token",
        "userProfilePath": "/v1/oauth/user"
      },
      "client": {
        "url": "http://localhost:4200",
        "loginPath": "/login"
      }
    }
}
```
