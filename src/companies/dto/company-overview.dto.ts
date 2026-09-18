export class CompanyOverviewSummaryDto {
  peopleCount: number;
  branchCount: number;
  socialChannelCount: number;
  opportunityCount: number;
  openOpportunityCount: number;
  taskCount: number;
  activeTaskCount: number;
  meetingCount: number;
  upcomingMeetingCount: number;
  activityCount: number;
  legalDocumentCount: number;
}

export class CompanyOverviewDto {
  companyId: string;
  generatedAt: string;
  summary: CompanyOverviewSummaryDto;
}
