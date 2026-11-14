import { Routes } from "@angular/router";
import { HomePage } from "./home/home";
import { SearchCandidatesPage } from "./candidates/search-candidates";
import { ViewCandidatePage } from "./candidates/view-candidate";
import { ConsultHistoryPage } from "./history/consult-history";
import { GestorPage } from "./gestor/gestor";

export const routes: Routes = [
  { path: "", component: HomePage },
  { path: "candidatos", component: SearchCandidatesPage },
  { path: "candidatos/:id", component: ViewCandidatePage },
  { path: "historial", component: ConsultHistoryPage },
  { path: "gestor", component: GestorPage },
];
