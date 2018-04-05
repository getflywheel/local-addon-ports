'use strict';

module.exports = function (context) {

	const hooks = context.hooks;
	const React = context.React;
	const {Route} = context.ReactRouter;

	const SiteInfoPorts = require('./SiteInfoPorts')(context);

	hooks.addContent('routesSiteInfo', () => {
		return <Route key="site-info-ports" path="/site-info/:siteID/ports" component={SiteInfoPorts}/>
	});

	hooks.addFilter('siteInfoMoreMenu', function (menu, site) {

		menu.push({
			label: 'Ports',
			enabled: !this.context.router.isActive(`/site-info/${site.id}/ports`),
			click: () => {
				context.events.send('goToRoute', `/site-info/${site.id}/ports`);
			}
		});

		return menu;

	});

};
