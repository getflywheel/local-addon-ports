import React, { Fragment } from 'react';
import path from 'path';
import { remote } from 'electron';
import { TableListRepeater } from '@getflywheel/local-components';
import confirm from 'local/renderer/confirm';

const { dialog } = remote;

const localPath = remote.app.getAppPath();
const siteData = remote.require(path.join(localPath, './helpers/site-data'));
const startSite = remote.require(path.join(localPath, './main/actions-sites/startSite'));
const getAvailablePorts = remote.require(path.join(localPath, './main/actions-docker/get-available-ports')).default;

export default class SiteInfoPorts extends React.Component {
	constructor (props) {
		super(props);

		this.state = {
			ports: [],
			unsavedPorts: [],
			containerInfo: null,
			provisioning: false,
		};

		this.inspectContainer = this.inspectContainer.bind(this);
		this.itemTemplate = this.itemTemplate.bind(this);
		this.remapPorts = this.remapPorts.bind(this);
	}

	componentDidMount () {
		this.inspectContainer();
	}

	inspectContainer () {

		const siteID = this.props.params.siteID;
		const site = this.props.sites[siteID];

		this.props.docker().getContainer(site.container).inspect((err, containerInfo) => {
			const ports = this.getPorts(containerInfo);

			this.setState({
				containerInfo,
				ports,
				unsavedPorts: ports,
			});
		});

	}

	getPorts (containerInfo) {

		const siteID = this.props.params.siteID;
		const site = this.props.sites[siteID];
		const ports = [];

		try {

			Object.keys(containerInfo.HostConfig.PortBindings).forEach(port => {

				let portInfo = containerInfo.HostConfig.PortBindings[port][0];

				const containerPort = port.replace('/tcp', '');

				ports.push({
					name: getKeyByValue(site.ports, portInfo.HostPort) || '',
					hostPort: portInfo.HostPort,
					containerPort,
				});

			});

		} catch (e) {
			console.warn(e);
		}

		return ports;

	}

	itemTemplate () {

		return getAvailablePorts(['PORT'], this.getUsedPorts()).then((allocatedPorts) => {

			return Promise.resolve({
				name: '',
				containerPort: '',
				hostPort: allocatedPorts.PORT,
			});

		});

	}

	getUsedPorts () {
		return this.state.unsavedPorts.map((port) => port.hostPort);
	}

	async remapPorts (ports) {

		let siteID = this.props.params.siteID;
		let site = this.props.sites[siteID];
		let errors = [];

		this.state.ports.forEach(port => {

			if (!port.name.trim()) {
				errors.push('• Please make sure all port mappings have a name.');
			}

			if (!port.containerPort) {
				errors.push('• Please make sure all ports mappings have a container port.');
			}

			if (!port.hostPort) {
				errors.push('• Please make sure all ports mappings have a host port.');
			}

		});

		if (errors.length) {

			return dialog.showErrorBox('Invalid Ports Provided', `Sorry! There were invalid port mappings provided.

${errors.join('\n')}`);

		}

		await confirm({
			title: 'Are you sure you want to remap the ports for this site?',
			message: <Fragment>
				<p>There may be inadvertent effects if ports aren't mapped correctly. Make sure you have an up-to-date
					backup.</p>
			</Fragment>,
			buttonText: 'Remap Ports',
		});

		this.setState({
			provisioning: true
		});

		this.props.sendEvent('updateSiteStatus', siteID, 'provisioning');

		this.props.docker().getContainer(site.container).commit().then(image => {

			let oldSiteContainer = site.container;

			this.props.docker().getContainer(site.container).kill().then(() => {

				const exposedPorts = {};
				const portBindings = {};

				ports.forEach((port) => {
					exposedPorts[`${port.containerPort}/tcp`] = {};

					portBindings[`${port.containerPort}/tcp`] = [{
						'HostPort': port.hostPort.toString(),
					}];
				});

				this.props.docker().createContainer({
					'Image': image.Id,
					'Cmd': this.state.containerInfo.Config.Cmd,
					'Tty': true,
					'ExposedPorts': exposedPorts,
					'HostConfig': {
						'Binds': this.state.containerInfo.HostConfig.Binds,
						'PortBindings': portBindings,
					},
				}).then((container) => {

					site.container = container.id;

					if ('clonedImage' in site) {
						if (typeof site.clonedImage != 'string') {
							site.clonedImage.push(image.Id);
						} else {
							site.clonedImage = [site.clonedImage, image.Id];
						}
					} else {
						site.clonedImage = image.Id;
					}

					site.ports = {};

					ports.forEach((port) => {
						site.ports[port.name] = port.hostPort;
					});

					siteData.updateSite(siteID, site);

					startSite(site).then(() => {
						this.props.sendEvent('updateSiteStatus', siteID, 'running');

						this.setState({
							provisioning: false,
							ports,
							unsavedPorts: ports,
						});

						this.props.notifier.notify({
							title: 'Ports Remapped',
							message: `Ports for ${site.name} have been remapped.`
						});

					});

					this.props.docker().getContainer(oldSiteContainer).remove();

				});

			});

		});

	}

	render () {

		const header = (
			<Fragment>
				<strong className="TableListRowHeader__SeparatorRight" style={{ width: '33%' }}>Port Name</strong>
				<strong className="TableListRowHeader__SeparatorRight" style={{ width: '33%' }}>Container Port</strong>
				<strong style={{ width: '33%' }}>Host Port</strong>
			</Fragment>
		);

		const repeatingContent = (port, index, updateItem) => (
			<Fragment>
				<div className="TableListRow__Input TableListRow__SeparatorRight">
					<input placeholder="Port Name" value={port.name} onChange={(e) => {
						port.name = e.target.value;
						updateItem(port);
					}}/>
				</div>

				<div className="TableListRow__Input TableListRow__SeparatorRight">
					<input placeholder="Container Port" value={port.containerPort} onChange={(e) => {
						port.containerPort = e.target.value;
						updateItem(port);
					}}/>
				</div>

				<div className="TableListRow__SeparatorRight">
					<code className="__Selectable">{port.hostPort}</code>
				</div>
			</Fragment>
		);

		return (
			<div style={{ flex: '1', overflowY: 'auto' }}>
				<TableListRepeater header={header} repeatingContent={repeatingContent}
								   onSubmit={this.remapPorts}
								   onChange={(unsavedPorts) => this.setState({ unsavedPorts })}
								   submitDisabled={this.state.provisioning || this.props.siteStatus != 'running'}
								   submitLabel={this.state.provisioning ? 'Remapping Ports...' : this.props.siteStatus == 'running' ? 'Remap Ports' : 'Start Site to Remap Ports'}
								   labelSingular="Port"
								   data={this.state.ports}
								   itemTemplate={this.itemTemplate}/>
			</div>
		);

	}

}

/* Credit: https://stackoverflow.com/a/28191966 */
function getKeyByValue (object, value) {
	return Object.keys(object).find(key => object[key] == value);
}
