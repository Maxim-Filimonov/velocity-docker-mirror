Package.describe({
  name: 'velocity:docker-mirror',
  version: '0.0.1',
  // Brief, one-line summary of the package.
  summary: '',
  // URL to the Git repository containing the source code for this package.
  git: '',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Npm.depends({
  dockerode: '2.0.7'
});

Package.onUse(function(api) {
  api.versionsFrom('1.0.3.2');
  api.use('practicalmeteor:loglevel@1.1.0_2', 'server');

  api.addFiles('lib/meteor/files.js', 'server');
  api.addFiles('dockerMirrorServer.js', 'server');

});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('velocity:docker-mirror');
});
