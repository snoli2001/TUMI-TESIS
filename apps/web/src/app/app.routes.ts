import { Routes } from "@angular/router";
import { BuscarCandidatosPage } from "./candidatos/buscar-candidatos";
import { VerCandidatoPage } from "./candidatos/ver-candidato";
import { ConsultarHistorialPage } from "./historial/consultar-historial";
import { VerificarAfirmacionPage } from "./verificar/verificar-afirmacion";
import { VerificarVideoPage } from "./verificar-video/verificar-video";

export const routes: Routes = [
  { path: "", component: VerificarAfirmacionPage },
  { path: "video", component: VerificarVideoPage },
  { path: "candidatos", component: BuscarCandidatosPage },
  { path: "candidatos/:id", component: VerCandidatoPage },
  { path: "historial", component: ConsultarHistorialPage },
];
