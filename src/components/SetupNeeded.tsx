export function SetupNeeded() {
  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-xl font-semibold">Falta conectar o Firebase</h1>
      <p className="mt-2 text-sm text-mute">
        A plataforma ainda não sabe qual projeto do Firebase usar. Crie o arquivo <code>.env.local</code> na pasta do
        projeto (copie de <code>.env.example</code>), cole os dados do seu app web do Firebase e rode{' '}
        <code>npm run dev</code> de novo. O passo a passo completo está no arquivo README.md.
      </p>
    </div>
  );
}
