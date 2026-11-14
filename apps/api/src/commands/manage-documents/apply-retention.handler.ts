import { Injectable } from "@nestjs/common";
import { sweepRetention } from "@tumi/database";
import { VectorSearchService } from "../verify-claim/evidence/vector-search.service";

@Injectable()
export class ApplyRetentionHandler {
  constructor(private readonly vectors: VectorSearchService) {}

  execute(): Promise<{ sessions: number; documents: number }> {
    return sweepRetention((id) => this.vectors.deleteByDocument(id));
  }
}
