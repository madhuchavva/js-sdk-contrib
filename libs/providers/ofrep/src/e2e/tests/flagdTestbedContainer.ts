import * as path from 'node:path';
import * as fs from 'node:fs';
import type { StartedTestContainer } from 'testcontainers';
import { GenericContainer, Wait } from 'testcontainers';

/**
 * The backend the OFREP conformance suite runs against.
 *
 * OFREP is a protocol rather than a product, so any conformant server would do. flagd-testbed is
 * used because it is the reference backend for the provider TCK's control API — its launchpad is
 * where `openapi/control-api.yaml` was derived from — and because flagd already serves OFREP on
 * port 8016, which the testbed image exposes. No new test infrastructure is therefore needed for
 * this adoption, and the OFREP suite is driven by exactly the same control API as the flagd one.
 *
 * ## Why this is not `FlagdComposeContainer`
 *
 * `libs/providers/flagd/src/e2e/tests/flagdComposeContainer.ts` does almost this job already, but it
 * is not reachable from here. It lives inside another Nx project's `src/` with no path mapping and
 * no export, so consuming it would mean a relative import across a project boundary — the thing
 * `@nx/enforce-module-boundaries` exists to prevent — and it types its port accessor in terms of
 * flagd's `ResolverType`, a concept OFREP does not have.
 *
 * Using `GenericContainer` rather than the testbed's Compose file is a simplification on top of
 * that: the Compose file also brings up an Envoy proxy, which exists to serve flagd's gRPC
 * transport-level e2e cases and is pure startup cost for an HTTP protocol. The image needs no volume
 * mount either — its flag sources are baked in at `./rawflags` and the launchpad combines them on
 * startup.
 *
 * The one thing shared with the flagd suite is the testbed *version*, read from the submodule so
 * that both suites move together and neither pins a tag of its own.
 */
export class FlagdTestbedContainer {
  private static readonly imageBase = 'ghcr.io/open-feature/flagd-testbed';
  private static readonly testHarnessDir = path.join(__dirname, './../../../../../shared/flagd-core/test-harness/');

  /** flagd's OFREP endpoint. The provider under test talks to this. */
  private static readonly OFREP_PORT = 8016;

  /** flagd's HTTP/health port. Exposed only so the wait strategy has something to poll. */
  private static readonly HEALTH_PORT = 8014;

  /** The launchpad, which implements the TCK's control API. */
  private static readonly LAUNCHPAD_PORT = 8080;

  private container?: StartedTestContainer;
  private readonly version: string;

  public static build(): FlagdTestbedContainer {
    return new FlagdTestbedContainer();
  }

  private constructor() {
    this.version = FlagdTestbedContainer.readVersion();
  }

  private static readVersion(): string {
    const versionFile = path.join(FlagdTestbedContainer.testHarnessDir, 'version.txt');
    try {
      return fs.readFileSync(versionFile, 'utf8').trim();
    } catch (error) {
      throw new Error(
        `could not read the flagd-testbed version from ${versionFile}. The test harness is a git ` +
          `submodule; run 'npx nx run flagd-core:pullTestHarness' (the e2e target does this for ` +
          `you). Underlying error: ${(error as Error).message}`,
      );
    }
  }

  isStarted(): boolean {
    return this.container !== undefined;
  }

  async start(): Promise<void> {
    if (this.isStarted()) {
      return;
    }

    const image = `${FlagdTestbedContainer.imageBase}:v${this.version}`;
    // eslint-disable-next-line no-console
    console.log(`Starting the OFREP backend under test: ${image}`);

    this.container = await new GenericContainer(image)
      .withExposedPorts(
        FlagdTestbedContainer.OFREP_PORT,
        FlagdTestbedContainer.HEALTH_PORT,
        FlagdTestbedContainer.LAUNCHPAD_PORT,
      )
      // The launchpad only begins listening once flagd reports healthy, but it is the flag server
      // the suite actually evaluates against, so wait on flagd itself rather than on the launchpad.
      .withWaitStrategy(Wait.forHttp('/healthz', FlagdTestbedContainer.HEALTH_PORT))
      .withStartupTimeout(60_000)
      .start();
  }

  async stop(): Promise<void> {
    if (!this.container) {
      throw new Error('Container not started');
    }

    await this.container.stop();
    this.container = undefined;
  }

  /** The base URL the OFREP provider is pointed at. `/ofrep/v1/...` is appended by the provider. */
  getOfrepBaseUrl(): string {
    return `http://${this.host()}:${this.mappedPort(FlagdTestbedContainer.OFREP_PORT)}`;
  }

  /** The root of the control API, scheme included. */
  getControlApiUrl(): string {
    return `http://${this.host()}:${this.mappedPort(FlagdTestbedContainer.LAUNCHPAD_PORT)}`;
  }

  private host(): string {
    return this.require().getHost();
  }

  private mappedPort(port: number): number {
    return this.require().getMappedPort(port);
  }

  private require(): StartedTestContainer {
    if (!this.container) {
      throw new Error('Container not started: its host ports do not exist until the stack is up');
    }
    return this.container;
  }
}
