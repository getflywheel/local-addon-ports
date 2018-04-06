const path = require('path');
const os = require('os');

module.exports = function (context) {

	const Component = context.React.Component;
	const React = context.React;
	const docker = context.docker.docker;
	const {remote} = context.electron;
	const dialog = remote.dialog;
	const sendEvent = context.events.send;

	const localPath = remote.app.getAppPath();

	const siteData = remote.require(path.join(localPath, './helpers/site-data'));
	const startSite = remote.require(path.join(localPath, './main/actions-sites/startSite'));
	const getAvailablePorts = remote.require(path.join(localPath, './main/actions-docker/get-available-ports')).default;

	return class SiteInfoPorts extends Component {
		constructor (props) {
			super(props);

			this.state = {
				ports: [],
				containerInfo: null,
				provisioning: false,
				isChanged: false
			};

			this.inspectContainer = this.inspectContainer.bind(this);
			this.stylesheetPath = path.resolve(__dirname, '../style.css');
			this.newPortKeyDown = this.newPortKeyDown.bind(this);
			this.removePort = this.removePort.bind(this);
			this.remapPorts = this.remapPorts.bind(this);
		}

		componentDidMount () {
			this.inspectContainer();
		}

		inspectContainer () {

			const siteID = this.props.params.siteID;
			const site = this.props.sites[siteID];

			docker().getContainer(site.container).inspect((err, containerInfo) => {
				this.setState({
					containerInfo,
					ports: this.getPorts(containerInfo),
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

		newPortKeyDown (event) {

			let ports = this.state.ports;

			let target = event.target.id.replace(/^add-/, '');
			let ref = Math.round(Math.random() * 1000);

			ports.push({
				name: '',
				hostPort: '',
				containerPort: '',
				ref
			});

			const newPortIndex = ports.length - 1;

			event.target.value = '';

			this.setState({
				ports
			}, () => {
				this.refs[`${ref}-${target}`].focus();
			});

			getAvailablePorts(['PORT'], this.getUsedPorts()).then((allocatedPorts) => {

				const ports = this.state.ports;

				ports[newPortIndex] = Object.assign({}, ports[newPortIndex], {
					hostPort: allocatedPorts.PORT,
				});

				this.setState({
					ports
				});

			});

		}

		getUsedPorts () {
			return this.state.ports.map((port) => port.hostPort);
		}

		portOnChange (input, index, event) {

			let ports = this.state.ports;

			ports[index][input] = event.target.value;

			this.setState({
				ports,
				isChanged: true
			});

		}

		removePort (index) {

			let choice = dialog.showMessageBox(remote.getCurrentWindow(), {
				type: 'question',
				buttons: ['Yes', 'No'],
				title: 'Confirm',
				message: `Are you sure you want to remove this port? This may cause your site to not function properly.`
			});

			if (choice !== 0) {
				return;
			}

			this.setState({
				ports: this.state.ports.filter((_, i) => i !== index),
				isChanged: true
			});

		}

		remapPorts () {

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

			let choice = dialog.showMessageBox(remote.getCurrentWindow(), {
				type: 'question',
				buttons: ['Cancel', 'Remap Ports'],
				title: 'Confirm',
				message: `Are you sure you want to remap the ports for this site? There may be inadvertent effects if ports aren't mapped correctly.

Last but not least, make sure you have an up-to-date backup.

There is no going back after this is done.`
			});

			if (choice === 0) {
				return;
			}

			this.setState({
				isChanged: false,
				provisioning: true
			});

			sendEvent('updateSiteStatus', siteID, 'provisioning');

			const ports = this.state.ports;

			docker().getContainer(site.container).commit().then(image => {

				let oldSiteContainer = site.container;

				docker().getContainer(site.container).kill().then(() => {

					const exposedPorts = {};
					const portBindings = {};

					ports.forEach((port) => {
						exposedPorts[`${port.containerPort}/tcp`] = {};

						portBindings[`${port.containerPort}/tcp`] = [{
							'HostPort': port.hostPort.toString(),
						}];
					});

					docker().createContainer({
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
							sendEvent('updateSiteStatus', siteID, 'running');

							this.setState({
								provisioning: false
							});

							context.notifier.notify({
								title: 'Ports Remapped',
								message: `Ports for ${site.name} have been remapped.`
							});

						});

						docker().getContainer(oldSiteContainer).remove();

					});

				});

			});

		}

		render () {
			return (
				<div className="PortsContainer">
					<link rel="stylesheet" href={this.stylesheetPath}/>

					<ul className="TableList Form">
						<li className="TableListRow">
							<strong>Port Name</strong>
							<strong>Container Port</strong>
							<strong>Host Port</strong>
						</li>
						{
							this.state.ports.map((port, index) => {
								let ref = 'ref' in port ? port.ref : `${port.name}:${port.containerPort}:${port.hostPort}`;

								return <li className="TableListRow" key={index}>
									<div>
										<input type="text" value={port.name} placeholder="Port Name"
										       ref={`${ref}-port-name`}
										       onChange={this.portOnChange.bind(this, 'name', index)}/>
									</div>

									<div>
										<input type="number" value={port.containerPort} placeholder="Container Port"
										       ref={`${ref}-container-port`} className="ContainerPort"
										       onChange={this.portOnChange.bind(this, 'containerPort', index)}/>
									</div>

									<div>
										<input type="number" value={port.hostPort} placeholder="Host Port"
										       ref={`${ref}-host-port`}
										       readOnly={true}/>
									</div>

									<div>
										<span className="RemovePort" onClick={this.removePort.bind(this, index)}>
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8">
												<path
													d="M7.71 6.29L5.41 4l2.3-2.29A1 1 0 0 0 6.29.29L4 2.59 1.71.29A1 1 0 1 0 .29 1.71L2.59 4 .29 6.29a1 1 0 1 0 1.42 1.42L4 5.41l2.29 2.3a1 1 0 0 0 1.42-1.42z"/>
											</svg>
										</span>
									</div>
								</li>
							})
						}
						<li className="TableListRow">
							<div>
								<input type="text" id="add-port-name" placeholder="Add Port Name"
								       onKeyDown={this.newPortKeyDown}/>
							</div>

							<div>
								<input type="text" id="add-container-port" placeholder="Add Container Port" className="ContainerPort"
								       onKeyDown={this.newPortKeyDown}/>
							</div>

							<div />
							<div />
						</li>
					</ul>

					<div className="Bottom">
						<button className="--Green --Pill"
						        disabled={!this.state.isChanged || this.state.provisioning || this.props.siteStatus != 'running'}
						        onClick={this.remapPorts}>
							{this.state.provisioning ? 'Remapping Ports...' : this.props.siteStatus == 'running' ? 'Remap Ports' : 'Start Site to Remap Ports'}
						</button>
					</div>
				</div>
			);

		}
	}

};

/* Credit: https://stackoverflow.com/a/28191966 */
function getKeyByValue (object, value) {
	return Object.keys(object).find(key => object[key] === value);
}
