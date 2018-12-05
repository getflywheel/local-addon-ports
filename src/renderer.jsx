import React from 'react';
import SiteInfoPorts from './SiteInfoPorts';

export default function (context) {

	const hooks = context.hooks;
	const { Route } = context.ReactRouter;

	hooks.addContent('routesSiteInfo', () => <Route key="site-info-ports" path="/site-info/:siteID/ports"
													render={(props) => <SiteInfoPorts {...props} sendEvent={context.events.send} docker={context.docker.docker}/>} notifier={context.notifier} />);

	hooks.addFilter('siteInfoMoreMenu', function (menu, site) {

		menu.push({
			label: 'Ports',
			enabled: !this.context.router.isActive(`/site-info/${site.id}/ports`),
			click: () => {
				context.events.send('goToRoute', `/site-info/${site.id}/ports`);
			},
		});

		return menu;

	});

}

