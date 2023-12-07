import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

export async function getServerSideProps({ query: { installation_id: installationId } }) {
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

  const octokit = new Octokit({ auth: token });

  const resp = await octokit.apps.listReposAccessibleToInstallation({
    installation_id: installationId,
  });

  const repos = resp.data.repositories.map((repo) => `repo:${repo.full_name}`).join(" AND ");

  const { data } = await octokit.search.code({
    q: `language:Markdown ${repos}`,
  });

  const files = data.items.map((item) => ({
    repository: item.repository.full_name,
    path: item.path,
  }));

  return { props: { files, repos } };
}

export default function PostInstall({ files, repos }) {
  return (
    <section>
      <h1>Post Install</h1>
      <pre>{JSON.stringify(repos, null, " ")}</pre>
      <pre>{JSON.stringify(files, null, " ")}</pre>
    </section>
  );
}
