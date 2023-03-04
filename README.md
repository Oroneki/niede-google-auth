# Instalar

`npm install @labti/niede-google-auth`

# Criar credenciais

Para criar credenciais é necessário antes ter um **projeto**. Caso não tenha criado ainda um projeto no Google Cloud, crie [neste link](https://console.cloud.google.com/cloud-resource-manager?walkthrough_id=resource-manager--create-project&start_index=1&hl=pt-br&_ga=2.229645276.1734630179.1677960034-1566356112.1599933203#step_index=1). Para maiores informações sobre projetos no Google Cloud acesse [esse recurso](https://cloud.google.com/resource-manager/docs/creating-managing-projects?hl=pt-br).

* Acesse a [página de credenciais](https://console.cloud.google.com/apis/credentials/) dentro do seu projeto.

* Clique no link **+ CRIAR CREDENCIAL** e escolha **ID do cliente OAuth**

* Em tipo de aplicativo, escolha **App para computador** e selecione um nome para identificar as credenciais. Após clique em **CRIAR**

* Na tela seguinte será possível copiar as credenciais "client_id" e "client_secret" ou fazer o download no seu computador.

# Como usar

```js
// importação (CommonJS) 
const { NiedeGoogleAuth, google } = require("@labti/niede-google-auth");

// importação (ESModules)
import { NiedeGoogleAuth, google } from "@labti/niede-google-auth";

// caso o arquivo de credenciais esteja salo na raiz do projeto
// basta instanciar a classe NiedeGoogleAuth sem argumentos
const niedeAuth = new NiedeGoogleAuth()

// ou é possível passar os argumentos diretamente
const niedeAuth2 = new NiedeGoogleAuth("meu_client_id", "meu_client_secret")

const main = async () => {

    await niedeAuth.init() // <-- inicia o processo de autenticação

    const sheetVals = await google.sheets({ // <-- utiliza qualquer api do google
        version: "v4", 
        auth: niedeAuth.auth() // <-- importante passar o auth como argumento
    }).spreadsheets.values.batchGet({
        // parâmetros aqui...
    });
    console.log(sheetVals.)
}

main();
```

# Exemplo

```js
const { NiedeGoogleAuth, google } = require("@labti/niede-google-auth");

const niedeAuth = new NiedeGoogleAuth()

const main = async () => {
    await niedeAuth.init()

    // seu código aqui! Não esquecer de utilizar o niedeAuth.auth()
}

main();
```