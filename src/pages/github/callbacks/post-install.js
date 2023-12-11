import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";

export async function getServerSideProps({ query: { installation_id: installationId } }) {
  const OctokitInstance = Octokit.plugin(throttling);

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
        octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`);

        if (retryCount < 1) {
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
      per_page: 50,
    })
  ).filter((repo) => !repo.fork);

  const repoQuery = repositories.map((repo) => `repo:${repo.full_name}`);

  let data = [];
  for (let repo of repoQuery) {
    const partialData = await octokit.paginate(octokit.search.code, {
      q: `language:Markdown ${repo}`,
      per_page: 50,
    });

    data.push(...partialData);
  }

  const files = data.map((item) => ({
    repository: item.repository.full_name,
    path: item.path,
  }));

  return { props: { files, repos: repoQuery } };
}

export default function PostInstall({ files, repos }) {
  return (
    <section>
      <h1>Post Install</h1>
      <pre>{repos.join(" OR ")}</pre>
      <pre>
        Repositories: {repos.length} Files: {files.length}
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
