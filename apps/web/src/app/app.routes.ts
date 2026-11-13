import { Routes } from "@angular/router";
import { HomePage } from "./home/home";
import { SearchCandidatesPage } from "./candidates/search-candidates";
import { ViewCandidatePage } from "./candidates/view-candidate";
import { ConsultHistoryPage } from "./history/consult-history";
import { VerifyClaimPage } from "./verify-claim/verify-claim";
import { VerifyVideoPage } from "./verify-video/verify-video";

export const routes: Routes = [
  { path: "", component: HomePage },
  { path: "consulta", component: VerifyClaimPage },
  { path: "video", component: VerifyVideoPage },
  { path: "candidatos", component: SearchCandidatesPage },
  { path: "candidatos/:id", component: ViewCandidatePage },
  { path: "historial", component: ConsultHistoryPage },
];
