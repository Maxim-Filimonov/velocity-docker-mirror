/*jshint -W030 */
/* global
 Velocity:true,
 DEBUG:true,
 log: true,
 sanjo1:true,
 loglevel: true
 */

DEBUG = !!process.env.VELOCITY_DEBUG;
log = loglevel.createPackageLogger('[docker-mirror]', process.env.VELOCITY_DEBUG ? 'DEBUG' : 'info');

(function () {
  'use strict';

  if (process.env.NODE_ENV !== 'development' ||
    process.env.IS_MIRROR) {
    return;
  }

  DEBUG && console.log('[docker-mirror] adding server code');

  var path = Npm.require('path'),
      Docker = Npm.require('dockerode'),
      MIRROR_TYPE = 'docker-mirror',
      nodeMirrorsCursor = VelocityMirrors.find({type: MIRROR_TYPE}),
      _mirrorChildProcesses = {};

  // init
  Meteor.startup(function initializeVelocity () {
    DEBUG && console.log('[velocity-node-mirror] Server restarted.');

    _restartMirrors();

    if (Package.autoupdate) {
      DEBUG && console.log('[docker-mirror] Aggressively reload client');
      Package.autoupdate.Autoupdate.autoupdateVersion = Random.id();
    }
  });

  _.extend(Velocity.Mirror, {
    /**
     * Starts a mirror and copies any specified fixture files into the mirror.
     *
     * @method start
     * @param {Object} options not used in this mirror
     * @param {Object} environment Required fields:
     *                   ROOT_URL
     *                   PORT
     *                   MONGO_URL
     *
     * @private
     */
    start: function (options, environment) {

      var appPath = _getAppPath();
      var mainJs = path.join(appPath, '.meteor', 'local', 'build', 'main.js');

      var mirrorChild = _getMirrorChild(environment.FRAMEWORK);
      if (mirrorChild.isRunning()) {
        return;
      }


      var spawnArgs = {
        command: process.execPath,
        args: [mainJs],
        options: {
          detached: true,
          cwd: appPath,
          env: _.defaults(environment, process.env)
        }
      };
      mirrorChild.spawn(spawnArgs);

      DEBUG && console.log('[velocity-node-mirror] Mirror container created with name', mirrorChild.name);

      Meteor.call('velocity/mirrors/init', {
        framework: environment.FRAMEWORK,
        port: environment.PORT,
        mongoUrl: environment.MONGO_URL,
        host: environment.HOST,
        rootUrl: environment.ROOT_URL,
        rootUrlPath: environment.ROOT_URL_PATH,
        type: MIRROR_TYPE
      }, {
        pid: mirrorChild.pid
      });

    } // end velocityStartMirror
  });

  /**
   * Iterates through the mirrors collection and kills all processes if they are running
   * @private
   */

  function _restartMirrors () {
    DEBUG && console.log('[velocity-node-mirror] Aggressively restarting all mirrors');
    nodeMirrorsCursor.forEach(function (mirror) {

      var mirrorChild = _getMirrorChild(mirror.framework);

      if (mirrorChild.isRunning()) {
        DEBUG && console.log('[docker-mirror] Restarting Mirror for framework ' + mirror.framework);
        mirrorChild.kill();

        Meteor.call('velocity/mirrors/request', {
          framework: mirror.framework,
          port: mirror.port,
          rootUrlPath: mirror.rootUrlPath
        });

      } else {
        DEBUG && console.log('[docker-mirror] Mirror for framework ' + mirror.framework + ' is not running');
      }
    });
  }

  function _createContainer(framework) {
    var docker = new Docker();
    var name = 'velocity-mirror-'+framework;

    return {
      name: name,
      kill: function() {
        DEBUG && console.log("[docker-mirror] Killing container " + name);
        var container = docker.getContainer(name);
        try {
          Meteor.wrapAsync(container.stop, container)();
          Meteor.wrapAsync(container.remove, container)();
        }
        catch(error) {
          DEBUG && console.log("[docker-mirror] Failed to kill container", error);
          throw error;
        }

      },
      isRunning: function(err, callback) {
        var container = docker.getContainer(name);

        if(this.isCreated()) {
          try {
            var data = Meteor.wrapAsync(container.inspect, container)();
            DEBUG && console.log("[docker-mirror] Container running state requested", data.State);
            return data.State.Running;
          }
          catch (error) {
            DEBUG && console.log("[docker-mirror] Failed to get running container state", error);
            throw error;
          }
        } else {
          return false;
        }
      },
      isCreated: function(err, callback) {
        var container = docker.getContainer(name);
        try {
          var data = Meteor.wrapAsync(container.inspect, container)();
          DEBUG && console.log("[docker-mirror] Container created state requested", data.State);
          return true;
        }
        catch (error) {
          if(error.message.indexOf("404") > -1) {
            DEBUG && console.log("[docker-mirror] Container is not created");
            return false;
          } else {
            throw error;
          }
        }
      },
      spawn: function(spawnOptions) {
        var cwd = spawnOptions.options.cwd;
        var mongoUrl = spawnOptions.options.env.MONGO_URL;
        console.log("SPAWNING WITH ", cwd, mongoUrl);
        try {
          var container = Meteor.wrapAsync(docker.createContainer, docker)({
            Image: "velocity-mirror",
            Cmd: ["meteor"],
            name: name,
          });
          try {
            var data = Meteor.wrapAsync(container.start, container)({
              Binds: [cwd + ":/app"],
              Env: ["MONGO_URL=" + mongoUrl]
            });
            DEBUG && console.log("[docker-mirror] Container started", data);
          }
          catch (error) {
            DEBUG && console.log("[docker-mirror] Failed to start container", error);
            throw error;
          }
        }
        catch (error) {
          DEBUG && console.log("[docker-mirror] Failed to create container", error);
          throw error;
        }
      }
    };
  }
  function _getMirrorChild (framework) {
    var mirrorChild = _mirrorChildProcesses[framework];
    if (!mirrorChild) {
      mirrorChild = _createContainer(framework);
      _mirrorChildProcesses[framework] = mirrorChild;
    }
    return mirrorChild;
  }

  function _getAppPath () {
    return path.resolve(findAppDir());
  }

})();
