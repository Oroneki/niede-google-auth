import { google } from "googleapis";
import * as http from "http";
import * as os from "os"
import debug from "debug";
const deb = debug("niede:auth");
import * as url from "url";
import * as fs from "fs";
import * as path from "path";
import { Socket, AddressInfo } from "net";
import { OAuth2Client } from "googleapis-common";
import { Credentials } from "google-auth-library";
import { launch } from "puppeteer-core";
import type { Browser } from "puppeteer-core";

// import { isBrowser } from "googleapis/node_modules/gaxios/build/src/isbrowser"
const closePuppeteerBrowser = async (b: Browser) => {
  const pages = await b.pages();
  for (const p of pages) {
      await p.close();
  }
  await b.close();
} 

const CONFIG_FOLDER_PATH = path.resolve(os.homedir(), ".niede-auth")
if (!fs.existsSync(CONFIG_FOLDER_PATH)) {
  fs.mkdirSync(CONFIG_FOLDER_PATH)
}

const PROFILE_AUTH_FOLDER_PATH = path.resolve(os.homedir(), ".niede-chrome-profile")
if (!fs.existsSync(PROFILE_AUTH_FOLDER_PATH)) {
  fs.mkdirSync(PROFILE_AUTH_FOLDER_PATH)
}

// https://console.cloud.google.com

const INFO_TOKENS_PATH = path.resolve(
  CONFIG_FOLDER_PATH,
  "gauth_oa2_tokens.json"
);

const defaultScopes = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/script.send_mail",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.send",
]

function enableDestroy(server: http.Server): http.Server {
  var connections: { [m: string]: Socket } = {};

  server.on("connection", function(conn) {
    var key = conn.remoteAddress + ":" + conn.remotePort;
    connections[key] = conn;
    conn.on("close", function() {
      deb("*delete conn: %s", key);
      delete connections[key];
    });
  });

  // @ts-ignore
  server.destroy = function(cb: any) {
    server.close(cb);
    for (const key of Object.keys(connections)) {
      deb("*destroy conn: %s", key);
      connections[key].destroy();
    }
  };

  return server;
}

type SimpleClientConstructorOptions = {
  scopes: string[];
  dataDir: string;
};

export class NiedeGoogleAuth {
  private oAuth2Client: OAuth2Client;
  private authorizeUrl: any;
  private serverPort: number = 0;
  private _inited: boolean = false;
  private chromeExecutablePath: string = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  
  constructor(
    client_id?: string,
    client_secret?: string,
    private _options: SimpleClientConstructorOptions = {
      scopes: defaultScopes,
      dataDir: CONFIG_FOLDER_PATH,      
    }
  ) {
    if (client_id === undefined || client_secret === undefined) {
      const arquivo = fs.readdirSync(path.resolve(".")).find(file => file.startsWith("client_secret") && file.endsWith(".json"))
      if (arquivo === undefined) {
        throw new Error("SECRETS_ERROR: É necessário fornecer o 'client_id' e 'client_secret' no construtor ou salvar o arquivo json com os secrets na pasta raiz do projeto.");        
      }
      const conteudo = JSON.parse(fs.readFileSync(path.resolve(".", arquivo)).toString())
      client_id = conteudo.installed?.client_id;
      client_secret = conteudo.installed?.client_secret;
      if (client_id === undefined || client_secret === undefined) {
        throw new Error(`SECRETS_ERROR: Verifique se o conteúdo do arquivo "${arquivo}" é válido e possui as credenciais.`);        
      }
    }
    let keyFile = {
        installed: {
          client_id,
          client_secret,
        }
      }      
    
    if (!keyFile.installed || !keyFile.installed.client_id) {
      deb("KeyFile Inválido: %O", keyFile);
      throw new Error("KeyFile Inválido");
    }

    // @ts-ignore
    this.oAuth2Client = new google.auth.OAuth2(
      keyFile.installed.client_id, keyFile.installed.client_secret
    );

    this.oAuth2Client.on("tokens", async tokens => {
      deb("\n(!) Novos tokens... %O\n", tokens);

      await fs.promises.writeFile(
        INFO_TOKENS_PATH,
        JSON.stringify({...this.oAuth2Client.credentials, ...tokens}, undefined, 4)
      );
      deb("salvos")      
    });
    
  }

  private getServerPort() {
    return this.serverPort;
  }

  private async saveCredentials(tokens?: any) { 
    let cred = tokens;
    if (!tokens) {
      cred = this.oAuth2Client.credentials
    }
    
    deb("saveCredentials")   
    await fs.promises.writeFile(
      INFO_TOKENS_PATH,
      JSON.stringify(tokens, undefined, 4)
    );
    deb("tokens saved... %O", cred);    
  }

  // Open an http server to accept the oauth callback. In this
  // simple example, the only request to our webserver is to
  // /oauth2callback?code=<code>
  private async authenticate(scopes: string[] = this._options.scopes) {
    deb("auth...")
    return new Promise(async (resolve, reject) => {
      // grab the url that will be used for authorization

      const execPath = this.chromeExecutablePath;
      let server = http
        .createServer(async (req: any, res: any) => {
          try {
            if (req.url.indexOf("/oauth2callback") > -1) {
              deb("req.url -> %s", req.url);
              const port = this.getServerPort();
              deb("serverPort -> %d", port);
              const qs = new url.URL(req.url, `http://localhost:${port}`)
                .searchParams;
              deb("qs.serachParams: %O", qs);
              res.end("Autenticado.");
              // @ts-ignore
              server.destroy();
              deb(
                "\n-----------------------------------\n CODE: %s\n",
                qs.get("code")
              );
              let resp
                try {
                  resp = await this.oAuth2Client.getToken({
                    code: qs.get("code") as string,
                    redirect_uri: `http://localhost:${port}/oauth2callback`
                  });
                  deb("RESP: %O", resp)
                  
                } catch (error) {
                  deb("ERRO no getToken() --> %O", error);
                  throw new Error("GETTOKEN ERROR");
                  
                }
              deb("tokens: %O", resp.tokens);
              this.oAuth2Client.setCredentials(resp.tokens)
              await this.saveCredentials(resp.tokens);
              resolve(this.oAuth2Client);
            }
          } catch (e) {
            deb("ERROR MAX: %O", e);
            reject(e);
          }
        })
        .listen(async () => {
          // open the browser to the authorize url to start the workflow
          // opn(this.authorizeUrl, { wait: false }).then((cp: any) => cp.unref());
          try {
            const browser = await launch({
              executablePath: execPath,
              headless: false,
              defaultViewport: null,
              userDataDir: PROFILE_AUTH_FOLDER_PATH,
              args: [
                "--window-size=550,850",
                "--window-position=100,100",
                // '--disable-gpu',
                "--no-sandbox",
                // '--kiosk',
                "--new-window",
                "--app"
                // '--disable-setuid-sandbox',
                //  '--disable-dev-shm-usage'
              ]
            });

            browser.on("targetchanged", async target => {
              const u = new url.URL(target.url());
              if (
                u.pathname === "/oauth2callback" &&
                u.hostname === "localhost"
              ) {
                deb("*final* fechar browser...");
                await closePuppeteerBrowser(browser);                
              }
            });

            const pages = await browser.pages();

            const page = pages[0];

            this.authorizeUrl = this.oAuth2Client.generateAuthUrl({
              access_type: "offline",
              scope: scopes,
              redirect_uri: `http://localhost:${this.serverPort}/oauth2callback`
            });
            deb("authorizeUrl = '%s'", this.authorizeUrl);

            await page.goto(this.authorizeUrl);
            deb("3");
          } catch (error) {
            deb("ERROR --> %O", error);
          }
        });
      const addrInfo = server.address() as AddressInfo;
      this.serverPort = addrInfo.port;
      enableDestroy(server);      
    });
  }

  public async init(scopes: string[] = this._options.scopes) {
    if (this._inited) return
    this.oAuth2Client.on("tokens", (t) => {
      deb("\n---------\nNOVOS TOKENS: \n%O\n-----------\n", t)
    })
        
    deb("google client init")
    try {
      await fs.promises.access(INFO_TOKENS_PATH, fs.constants.F_OK);
      deb("acesso info...")
    } catch (error) {
      deb("autenticar...")
      try {
        await this.authenticate(scopes);
        this._inited = true;
        return;        
      } catch (error) {
        deb("erro auth ---< %O", error)
      }
    }

    deb("Credentials exist");
    const fileContents = await fs.promises.readFile(INFO_TOKENS_PATH);
    const tokens: Credentials = JSON.parse(fileContents.toString());
    deb("Tokens: %O", tokens);
    if (tokens.expiry_date === null || tokens.expiry_date === undefined) {
      throw new Error("Invalid token with no expiry date");      
    }
    const expiresAt = new Date(tokens.expiry_date);
    deb("expires at => %O", expiresAt);
    this.oAuth2Client.setCredentials(tokens);
    
    try {
      deb("getAccesToken....")
      const resp = await this.oAuth2Client.getAccessToken();
      deb("resp acess token: %O", resp)
      if (resp.token !== this.oAuth2Client.credentials.access_token) {
        deb("new access token")
        deb("expire diff %o", this.oAuth2Client.credentials.expiry_date! - tokens.expiry_date)
        deb("refresh token === %o", this.oAuth2Client.credentials.refresh_token === tokens.refresh_token)
        await this.saveCredentials({...tokens, access_token: resp.token})
      } else {
        deb("reutilizar token")        
      }
     
         
    } catch (error) {
      deb("error getAccessToken %O", error)
        try {
          deb("set Credentials... token antigo re-auth")
          await this.authenticate()      
        } catch (error) {
          deb("Erro ao atenticar: %O", error)
        }
    }

    this._inited = true;
    
  }

  public getClient() {
    return this.oAuth2Client;
  }

  public setChromePath(path: string) {
    this.chromeExecutablePath = path;
  }

  public auth() {
    return this.oAuth2Client;
  }

  public async handleClientError(err: any) {
    deb("ERROR: %O", err);
    for (const er of err.errors) {
      if (er.reason === "insufficientPermissions") {
        deb("insufficient permission err");
        await this.authenticate(this._options.scopes);
      }
    }
  }
}



