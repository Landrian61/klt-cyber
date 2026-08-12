import { ProfileReviewClient } from "./ProfileReviewClient";

export default async function ProfileReviewPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  return <ProfileReviewClient profileId={profileId} />;
}
