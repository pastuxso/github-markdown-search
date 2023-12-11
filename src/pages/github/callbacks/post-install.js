import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";

function* chunkArray(arr, chunkSize) {
  for (let i = 0; i < arr.length; i += chunkSize) {
    yield arr.slice(i, i + chunkSize);
  }
}

export async function getServerSideProps({ query: { installation_id: installationId } }) {
  const OctokitInstance = Octokit.plugin(throttling);
  const started = new Date().toISOString();

  const auth = createAppAuth({
    appId: process.env.GITHUB_INSTALL_APP_ID,
    clientId: process.env.GITHUB_INSTALL_CLIEN_ID,
    clientSecret: process.env.GITHUB_INSTALL_CLIENT_SECRET,
    privateKey: process.env.GITHUB_INSTALL_PRIV_KEY,
  });

  const { token } = await auth({
    type: "installation",
    installationId: installationId,
  });

  const octokit = new OctokitInstance({
    auth: token,
    throttle: {
      onRateLimit: (retryAfter, options, octokit, retryCount) => {
        octokit.log.warn(
          `Request quota exhausted for request ${options.method} ${options.url} Retrying after ${retryAfter} seconds!`
        );

        if (retryCount < 2) {
          // only retries once
          octokit.log.info(`Retrying after ${retryAfter} seconds!`);
          return true;
        }
      },
      onSecondaryRateLimit: (retryAfter, options, octokit) => {
        // does not retry, only logs a warning
        octokit.log.warn(
          `SecondaryRateLimit detected for request ${options.method} ${options.url}`
        );
      },
    },
  });

  const repositories = (
    await octokit.paginate(octokit.apps.listReposAccessibleToInstallation, {
      installation_id: installationId,
      per_page: 100,
    })
  ).filter((repo) => !repo.fork);

  const repoQuery = repositories.map((repo) => `repo:${repo.full_name}`);

  let data = [];
  for (const repos of chunkArray(repoQuery, 10)) {
    const partialData = await octokit.paginate(octokit.search.code, {
      q: `language:Markdown ${repos.join(" ")}`,
      per_page: 100,
    });

    data.push(...partialData);
  }

  const files = data.map((item) => ({
    repository: item.repository.full_name,
    path: item.path,
  }));

  const finished = new Date().toISOString();
  return { props: { files, repos: repoQuery, started, finished } };
}

export default function PostInstall({ files, repos, started, finished }) {
  return (
    <section>
      <h1>Post Install</h1>
      <pre>{repos.join(" OR ")}</pre>
      <pre>
        Repositories: {repos.length} Files: {files.length} - Started: {started} Finished: {finished}
      </pre>
      <pre>{JSON.stringify(files, null, " ")}</pre>
    </section>
  );
}

// manual pagination
/*while (octokit.hasNextPage(searchResult)) {
  searchResult = await octokit.getNextPage(searchResult);
  // Process additional search results
}*/
