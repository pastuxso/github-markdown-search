import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";

function splitIntoChunks(array, maxLength) {
  const chunks = [];
  let currentChunk = [];

  for (const item of array) {
    const chunkLength = currentChunk.join(" ").length;

    if (chunkLength + item.length + 1 <= maxLength) {
      currentChunk.push(item);
    } else {
      chunks.push(currentChunk.join(" "));
      currentChunk = [item];
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  return chunks;
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

  // https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28#limitations-on-query-length
  const prefix = "language:Markdown ";
  const maxChunkLength = 256 - prefix.length;

  const chunks = splitIntoChunks(repoQuery, maxChunkLength);
  let data = [];
  for (const repos of chunks) {
    const partialData = await octokit.paginate(octokit.search.code, {
      q: `${prefix} ${repos}`,
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
      <pre>{repos.join(" ")}</pre>
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
