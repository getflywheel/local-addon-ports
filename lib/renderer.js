'use strict';

module.exports = function (context) {

	var hooks = context.hooks;
	var React = context.React;
	var Route = context.ReactRouter.Route;


	var SiteInfoPorts = require('./SiteInfoPorts')(context);

	hooks.addContent('routesSiteInfo', function () {
		return React.createElement(Route, { key: 'site-info-ports', path: '/site-info/:siteID/ports', component: SiteInfoPorts });
	});

	hooks.addFilter('siteInfoMoreMenu', function (menu, site) {

		menu.push({
			label: 'Ports',
			enabled: !this.context.router.isActive('/site-info/' + site.id + '/ports'),
			click: function click() {
				context.events.send('goToRoute', '/site-info/' + site.id + '/ports');
			}
		});

		return menu;
	});
};