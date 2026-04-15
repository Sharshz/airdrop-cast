import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Wallet, 
  LogOut, 
  Twitter, 
  Repeat, 
  Heart, 
  CheckCircle2, 
  ExternalLink, 
  Coins,
  ArrowRight,
  ShieldCheck,
  Users,
  Trophy
} from 'lucide-react';
import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  onSnapshot, 
  orderBy, 
  serverTimestamp, 
  doc, 
  setDoc, 
  updateDoc,
  getDocs
} from 'firebase/firestore';
import { auth, db, OperationType, handleFirestoreError } from './lib/firebase';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './components/ui/dialog';
import { Badge } from './components/ui/badge';
import { toast } from 'sonner';

// Types
interface Campaign {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  tokenAddress: string;
  tokenSymbol: string;
  totalReward: number;
  rewardPerParticipant: number;
  maxParticipants: number;
  currentParticipants: number;
  recastTask?: string;
  status: 'active' | 'completed';
  createdAt: any;
}

interface Participant {
  userId: string;
  walletAddress: string;
  campaignId: string;
  position: number;
  signal: string;
  claimed: boolean;
  joinedAt: any;
}

export default function App() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [user, setUser] = useState<User | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    title: '',
    description: '',
    tokenAddress: '',
    tokenSymbol: '',
    totalReward: 0,
    rewardPerParticipant: 0,
    maxParticipants: 100,
    recastTask: '',
  });

  const [joiningCampaignId, setJoiningCampaignId] = useState<string | null>(null);
  const [signal, setSignal] = useState('');
  const [shareModalData, setShareModalData] = useState<{
    isOpen: boolean;
    campaignTitle: string;
    position: number;
  }>({ isOpen: false, campaignTitle: '', position: 0 });
  const [resultsModalData, setResultsModalData] = useState<{
    isOpen: boolean;
    campaign: Campaign | null;
  }>({ isOpen: false, campaign: null });

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Campaigns Listener
  useEffect(() => {
    const q = query(collection(db, 'campaigns'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const campaignData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Campaign[];
      setCampaigns(campaignData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'campaigns');
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      toast.success('Logged in successfully');
    } catch (error) {
      console.error(error);
      toast.error('Failed to login');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Logged out');
    } catch (error) {
      console.error(error);
    }
  };

  const handleCreateCampaign = async () => {
    if (!user) return toast.error('Please login first');
    if (!isConnected) return toast.error('Please connect wallet');

    try {
      const campaignData = {
        ...newCampaign,
        creatorId: user.uid,
        currentParticipants: 0,
        status: 'active',
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'campaigns'), campaignData);
      setIsCreateDialogOpen(false);
      toast.success('Campaign launched!');
      setNewCampaign({
        title: '',
        description: '',
        tokenAddress: '',
        tokenSymbol: '',
        totalReward: 0,
        rewardPerParticipant: 0,
        maxParticipants: 100,
        recastTask: '',
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'campaigns');
    }
  };

  const handleParticipate = async (campaignId: string) => {
    if (!user) return toast.error('Please login first');
    if (!isConnected) return toast.error('Please connect wallet');
    if (!signal.trim()) return toast.error('Please share why you are early');

    try {
      const campaign = campaigns.find(c => c.id === campaignId);
      if (!campaign) return;

      // Check if already joined
      const participantRef = doc(db, 'campaigns', campaignId, 'participants', user.uid);
      
      const position = campaign.currentParticipants + 1;
      
      await setDoc(participantRef, {
        userId: user.uid,
        walletAddress: address,
        campaignId: campaignId,
        position: position,
        signal: signal,
        claimed: false,
        joinedAt: serverTimestamp()
      });

      // Update campaign participant count
      const campaignRef = doc(db, 'campaigns', campaignId);
      await updateDoc(campaignRef, {
        currentParticipants: position
      });

      setJoiningCampaignId(null);
      setSignal('');
      toast.success(`Position Locked! You are #${position} early.`);
      
      // Open Share Modal
      setShareModalData({
        isOpen: true,
        campaignTitle: campaign.title,
        position: position
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `campaigns/${campaignId}/participants/${user.uid}`);
    }
  };

  const handleCompleteCampaign = async (campaignId: string) => {
    if (!user) return;
    try {
      const campaignRef = doc(db, 'campaigns', campaignId);
      await updateDoc(campaignRef, {
        status: 'completed'
      });
      
      const campaign = campaigns.find(c => c.id === campaignId);
      if (campaign) {
        setResultsModalData({
          isOpen: true,
          campaign: { ...campaign, status: 'completed' }
        });
      }
      toast.success('Campaign completed successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `campaigns/${campaignId}`);
    }
  };

  const [myParticipations, setMyParticipations] = useState<(Participant & { campaign: Campaign })[]>([]);

  // Participations Listener
  useEffect(() => {
    if (!user) {
      setMyParticipations([]);
      return;
    }

    // This is a bit tricky with Firestore since we need to query across campaigns
    // For now, we'll fetch all campaigns and then check for participant docs
    // In a real app, we might have a top-level 'participations' collection
    const fetchParticipations = async () => {
      const participations: (Participant & { campaign: Campaign })[] = [];
      for (const campaign of campaigns) {
        const participantDoc = await getDocs(query(collection(db, 'campaigns', campaign.id, 'participants')));
        const myDoc = participantDoc.docs.find(d => d.id === user.uid);
        if (myDoc) {
          participations.push({
            ...(myDoc.data() as Participant),
            campaign
          });
        }
      }
      setMyParticipations(participations);
    };

    fetchParticipations();
  }, [user, campaigns]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-orange-500/30">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/50 backdrop-blur-xl">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
              <ShieldCheck className="text-white w-6 h-6" />
            </div>
            <span className="font-bold text-xl tracking-tight hidden sm:block">AlphaDrop</span>
          </div>

          <div className="flex items-center gap-3">
            {!isConnected ? (
              <Button 
                variant="outline" 
                className="border-white/10 hover:bg-white/5"
                onClick={() => connect({ connector: connectors[0] })}
              >
                <Wallet className="w-4 h-4 mr-2" />
                Connect Wallet
              </Button>
            ) : (
              <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs font-mono opacity-70">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </span>
                <button onClick={() => disconnect()} className="hover:text-red-400 transition-colors">
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {!user ? (
              <Button onClick={handleLogin} className="bg-white text-black hover:bg-white/90">
                Login
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <img src={user.photoURL || ''} alt="avatar" className="w-8 h-8 rounded-full border border-white/20" />
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        {/* Hero Section */}
        <section className="mb-16 text-center max-w-3xl mx-auto">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
            </span>
            <span className="text-xs font-bold text-purple-500 uppercase tracking-widest">Live Alpha Market</span>
          </div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl sm:text-7xl font-bold mb-6 tracking-tighter"
          >
            Social Alpha Market <br /> powered by <span className="text-blue-500">Base</span>
          </motion.h1>
          <p className="text-white/60 text-lg mb-8 leading-relaxed">
            Be early. Rank high. Earn rewards. <br />
            AlphaDrop turns early belief into real value on Base.
          </p>
          
          <div className="flex flex-wrap justify-center gap-4">
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger 
                render={
                  <Button size="lg" className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-8 h-14 rounded-2xl">
                    <Plus className="w-5 h-5 mr-2" />
                    Create Campaign
                  </Button>
                }
              />
              <DialogContent className="bg-[#111] border-white/10 text-white max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold">New Airdrop Campaign</DialogTitle>
                  <DialogDescription className="text-white/60">
                    Fill in the details to launch your token airdrop.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Campaign Title</Label>
                    <Input 
                      placeholder="e.g. Base Summer Airdrop" 
                      className="bg-white/5 border-white/10"
                      value={newCampaign.title}
                      onChange={e => setNewCampaign({...newCampaign, title: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Token Address</Label>
                      <Input 
                        placeholder="0x..." 
                        className="bg-white/5 border-white/10"
                        value={newCampaign.tokenAddress}
                        onChange={e => setNewCampaign({...newCampaign, tokenAddress: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Token Symbol</Label>
                      <Input 
                        placeholder="ALPHA" 
                        className="bg-white/5 border-white/10"
                        value={newCampaign.tokenSymbol}
                        onChange={e => setNewCampaign({...newCampaign, tokenSymbol: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Total Reward</Label>
                      <Input 
                        type="number" 
                        placeholder="1000" 
                        className="bg-white/5 border-white/10"
                        value={newCampaign.totalReward}
                        onChange={e => setNewCampaign({...newCampaign, totalReward: Number(e.target.value)})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Participants</Label>
                      <Input 
                        type="number" 
                        placeholder="100" 
                        className="bg-white/5 border-white/10"
                        value={newCampaign.maxParticipants}
                        onChange={e => setNewCampaign({...newCampaign, maxParticipants: Number(e.target.value)})}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Reward Per Participant (Est.)</Label>
                    <Input 
                      type="number" 
                      placeholder="10" 
                      className="bg-white/5 border-white/10"
                      value={newCampaign.rewardPerParticipant}
                      onChange={e => setNewCampaign({...newCampaign, rewardPerParticipant: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Recast Task (Cast URL or ID) - Optional</Label>
                    <Input 
                      placeholder="https://warpcast.com/..." 
                      className="bg-white/5 border-white/10"
                      value={newCampaign.recastTask}
                      onChange={e => setNewCampaign({...newCampaign, recastTask: e.target.value})}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateCampaign} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold">
                    Launch Campaign
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            
            <Button size="lg" variant="outline" className="border-white/10 hover:bg-white/5 h-14 px-8 rounded-2xl">
              Explore Alpha
            </Button>
          </div>
        </section>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-16">
          {[
            { label: 'Active Markets', value: campaigns.length, icon: Trophy },
            { label: 'Early Believers', value: '12.4k', icon: Users },
            { label: 'Value Distributed', value: '$450k+', icon: Coins },
          ].map((stat, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white/5 border border-white/10 p-6 rounded-3xl"
            >
              <stat.icon className="w-6 h-6 text-purple-500 mb-4" />
              <div className="text-3xl font-bold mb-1">{stat.value}</div>
              <div className="text-white/40 text-sm uppercase tracking-wider font-medium">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Campaign Tabs */}
        <Tabs defaultValue="all" className="w-full">
          <div className="flex items-center justify-between mb-8">
            <TabsList className="bg-white/5 border border-white/10 p-1 rounded-xl">
              <TabsTrigger value="all" className="rounded-lg px-6 data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                All Airdrops
              </TabsTrigger>
              <TabsTrigger value="my" className="rounded-lg px-6 data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                My Participations
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="all">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {campaigns.map((campaign, i) => (
                  <motion.div
                    key={campaign.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card className="bg-[#111] border-white/10 hover:border-purple-500/50 transition-all duration-300 group overflow-hidden flex flex-col h-full">
                      <div className="absolute top-0 right-0 p-4">
                        <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20">
                          {campaign.tokenSymbol}
                        </Badge>
                      </div>
                      <CardHeader>
                        <CardTitle className="text-xl font-bold group-hover:text-purple-500 transition-colors">
                          {campaign.title}
                        </CardTitle>
                        <CardDescription className="text-white/40 line-clamp-2">
                          {campaign.description || `Earn ${campaign.rewardPerParticipant} ${campaign.tokenSymbol} by being early to this alpha.`}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4 flex-grow">
                        <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                          <div className="flex items-center gap-2">
                            <Coins className="w-4 h-4 text-purple-500" />
                            <span className="text-sm font-medium">Reward Pool</span>
                          </div>
                          <span className="font-bold">{campaign.totalReward} {campaign.tokenSymbol}</span>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs font-semibold text-white/40 uppercase tracking-widest">
                            <span>Scarcity</span>
                            <span>{campaign.currentParticipants} / {campaign.maxParticipants}</span>
                          </div>
                          <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${(campaign.currentParticipants / campaign.maxParticipants) * 100}%` }}
                              className="h-full bg-purple-500"
                            />
                          </div>
                        </div>

                        {campaign.recastTask && (
                          <div className="flex items-center gap-2 p-2 bg-purple-500/5 rounded-lg border border-purple-500/10">
                            <Repeat className="w-3 h-3 text-purple-500" />
                            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-tighter">Recast Boost Active</span>
                          </div>
                        )}
                      </CardContent>
                      <CardFooter>
                        {campaign.status === 'completed' ? (
                          <Button 
                            variant="outline"
                            className="w-full border-purple-500/20 text-purple-400 font-bold rounded-xl"
                            onClick={() => setResultsModalData({ isOpen: true, campaign })}
                          >
                            View Results
                            <Trophy className="w-4 h-4 ml-2" />
                          </Button>
                        ) : user?.uid === campaign.creatorId ? (
                          <Button 
                            onClick={() => handleCompleteCampaign(campaign.id)}
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl"
                          >
                            Complete Campaign
                            <CheckCircle2 className="w-4 h-4 ml-2" />
                          </Button>
                        ) : joiningCampaignId === campaign.id ? (
                          <div className="w-full space-y-3">
                            <textarea 
                              placeholder="Why are you early? (Signal)"
                              className="w-full bg-black border border-white/10 rounded-xl p-3 text-sm focus:border-purple-500 outline-none transition-colors"
                              value={signal}
                              onChange={e => setSignal(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <Button 
                                variant="ghost" 
                                className="flex-1"
                                onClick={() => setJoiningCampaignId(null)}
                              >
                                Cancel
                              </Button>
                              <Button 
                                className="flex-[2] bg-purple-600 hover:bg-purple-700 text-white font-bold"
                                onClick={() => handleParticipate(campaign.id)}
                              >
                                Lock Position
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button 
                            onClick={() => setJoiningCampaignId(campaign.id)}
                            className="w-full bg-white text-black hover:bg-purple-600 hover:text-white transition-all font-bold rounded-xl"
                          >
                            Join Early
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </Button>
                        )}
                      </CardFooter>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </TabsContent>

          <TabsContent value="my">
            {myParticipations.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {myParticipations.map((p, i) => (
                  <motion.div
                    key={p.campaign.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card className="bg-[#111] border-white/10 overflow-hidden">
                      <CardHeader>
                        <div className="flex justify-between items-start mb-2">
                          <Badge className="bg-purple-500 text-white font-bold">
                            {p.campaign.tokenSymbol}
                          </Badge>
                          {p.claimed && <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Claimed</Badge>}
                        </div>
                        <CardTitle className="text-xl font-bold">{p.campaign.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between p-4 bg-purple-500/10 rounded-2xl border border-purple-500/20">
                            <div>
                              <p className="text-xs font-semibold text-purple-400 uppercase tracking-widest mb-1">Your Position</p>
                              <p className="text-3xl font-bold text-white">#{p.position}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-semibold text-purple-400 uppercase tracking-widest mb-1">Est. Reward</p>
                              <p className="text-xl font-bold text-white">{p.campaign.rewardPerParticipant} {p.campaign.tokenSymbol}</p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Your Signal</p>
                            <p className="text-sm italic text-white/80 bg-white/5 p-3 rounded-xl border border-white/10">
                              "{p.signal}"
                            </p>
                          </div>

                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Early Believers</p>
                            <div className="space-y-1">
                              {[1, 2, 3].map(rank => (
                                <div key={rank} className="flex justify-between items-center p-2 bg-white/5 rounded-lg text-xs">
                                  <span className="text-white/40">#{rank}</span>
                                  <span className="font-mono">0x...{Math.random().toString(16).slice(2, 6)}</span>
                                  <span className="text-purple-500">🥇</span>
                                </div>
                              ))}
                              <div className="flex justify-between items-center p-2 bg-purple-600 text-white rounded-lg text-xs font-bold">
                                <span>#{p.position}</span>
                                <span>YOU 👀</span>
                                <span>✨</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="pt-4 border-t border-white/5 space-y-4">
                          <Button 
                            variant="outline" 
                            className="w-full border-purple-500/20 hover:bg-purple-500/10 text-purple-400 text-xs h-9"
                            onClick={() => {
                              const text = encodeURIComponent(`I'm early! Secured position #${p.position} for ${p.campaign.title} on AlphaDrop. 🚀\n\nJoin the alpha: ${window.location.href}`);
                              window.open(`https://warpcast.com/~/compose?text=${text}`, '_blank');
                            }}
                          >
                            <ExternalLink className="w-3 h-3 mr-2" />
                            Share Position on Farcaster
                          </Button>
                        </div>
                      </CardContent>
                      <CardFooter>
                        <Button 
                          disabled={p.claimed}
                          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold disabled:bg-white/5 disabled:text-white/20"
                        >
                          {p.claimed ? 'Rewards Claimed' : 'Claim Rewards'}
                        </Button>
                      </CardFooter>
                    </Card>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-3xl p-12 text-center">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Trophy className="w-8 h-8 text-white/20" />
                </div>
                <h3 className="text-xl font-bold mb-2">No participations yet</h3>
                <p className="text-white/40 mb-8">Join an active airdrop to start earning rewards.</p>
                <Button variant="outline" className="border-white/10">Browse Campaigns</Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Share Modal */}
      <Dialog 
        open={shareModalData.isOpen} 
        onOpenChange={(open) => setShareModalData(prev => ({ ...prev, isOpen: open }))}
      >
        <DialogContent className="bg-[#111] border-purple-500/20 text-white max-w-sm text-center p-8">
          <div className="flex flex-col items-center gap-6">
            <div className="w-20 h-20 bg-purple-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-purple-500/40 animate-bounce">
              <Trophy className="text-white w-10 h-10" />
            </div>
            
            <div className="space-y-2">
              <DialogTitle className="text-3xl font-bold tracking-tighter">Position Locked!</DialogTitle>
              <DialogDescription className="text-white/60 text-lg">
                You are <span className="text-purple-400 font-bold">#{shareModalData.position}</span> early to <br />
                <span className="text-white font-medium">{shareModalData.campaignTitle}</span>
              </DialogDescription>
            </div>

            <div className="w-full p-4 bg-white/5 rounded-2xl border border-white/10 text-left">
              <p className="text-xs font-bold text-purple-500 uppercase tracking-widest mb-2">Preview Post</p>
              <p className="text-sm text-white/80 italic">
                "I just joined {shareModalData.campaignTitle} early at #{shareModalData.position} on AlphaDrop! 🚀 Join the alpha..."
              </p>
            </div>

            <div className="w-full space-y-3">
              <Button 
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold h-14 rounded-2xl text-lg"
                onClick={() => {
                  const text = encodeURIComponent(`I'm early! Secured position #${shareModalData.position} for ${shareModalData.campaignTitle} on AlphaDrop. 🚀\n\nJoin the alpha: ${window.location.href}`);
                  window.open(`https://warpcast.com/~/compose?text=${text}`, '_blank');
                  setShareModalData(prev => ({ ...prev, isOpen: false }));
                }}
              >
                <ExternalLink className="w-5 h-5 mr-2" />
                Share on Farcaster
              </Button>
              <Button 
                variant="ghost" 
                className="w-full text-white/40 hover:text-white"
                onClick={() => setShareModalData(prev => ({ ...prev, isOpen: false }))}
              >
                Maybe later
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Results Modal */}
      <Dialog 
        open={resultsModalData.isOpen} 
        onOpenChange={(open) => setResultsModalData(prev => ({ ...prev, isOpen: open }))}
      >
        <DialogContent className="bg-[#111] border-purple-500/20 text-white max-w-md text-center p-8">
          {resultsModalData.campaign && (
            <div className="flex flex-col items-center gap-6">
              <div className="w-20 h-20 bg-green-500 rounded-3xl flex items-center justify-center shadow-2xl shadow-green-500/40">
                <CheckCircle2 className="text-black w-10 h-10" />
              </div>
              
              <div className="space-y-2">
                <DialogTitle className="text-3xl font-bold tracking-tighter">Campaign Successful!</DialogTitle>
                <DialogDescription className="text-white/60 text-lg">
                  <span className="text-white font-medium">{resultsModalData.campaign.title}</span> has ended.
                </DialogDescription>
              </div>

              <div className="grid grid-cols-2 gap-4 w-full">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                  <p className="text-xs font-bold text-purple-500 uppercase tracking-widest mb-1">Distributed</p>
                  <p className="text-xl font-bold">{resultsModalData.campaign.totalReward} {resultsModalData.campaign.tokenSymbol}</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                  <p className="text-xs font-bold text-purple-500 uppercase tracking-widest mb-1">Believers</p>
                  <p className="text-xl font-bold">{resultsModalData.campaign.currentParticipants}</p>
                </div>
              </div>

              <div className="w-full p-4 bg-white/5 rounded-2xl border border-white/10 text-left">
                <p className="text-xs font-bold text-purple-500 uppercase tracking-widest mb-2">Alpha Winners</p>
                <div className="space-y-2">
                  {[1, 2, 3].map(rank => (
                    <div key={rank} className="flex justify-between items-center text-sm">
                      <span className="text-white/40">#{rank}</span>
                      <span className="font-mono">0x...{Math.random().toString(16).slice(2, 6)}</span>
                      <span className="font-bold text-green-400">+{(resultsModalData.campaign!.rewardPerParticipant * (1.5 / rank)).toFixed(1)} {resultsModalData.campaign!.tokenSymbol}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full space-y-3">
                <Button 
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold h-14 rounded-2xl text-lg"
                  onClick={() => {
                    const text = encodeURIComponent(`✅ ${resultsModalData.campaign!.title} Successful!\n\n${resultsModalData.campaign!.totalReward} ${resultsModalData.campaign!.tokenSymbol} distributed to ${resultsModalData.campaign!.currentParticipants} early believers on AlphaDrop. 🚀\n\nCheck the results: ${window.location.href}`);
                    window.open(`https://warpcast.com/~/compose?text=${text}`, '_blank');
                  }}
                >
                  <ExternalLink className="w-5 h-5 mr-2" />
                  Share Results on Farcaster
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full text-white/40 hover:text-white"
                  onClick={() => setResultsModalData(prev => ({ ...prev, isOpen: false }))}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 mt-20">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-purple-500 w-5 h-5" />
            <span className="font-bold">AlphaDrop</span>
          </div>
          <div className="flex gap-8 text-sm text-white/40">
            <a href="#" className="hover:text-white transition-colors">Documentation</a>
            <a href="#" className="hover:text-white transition-colors">Base Chain</a>
            <a href="#" className="hover:text-white transition-colors">Twitter</a>
          </div>
          <div className="text-xs text-white/20">
            © 2026 Proof of Alpha. Built on Base.
          </div>
        </div>
      </footer>
    </div>
  );
}
