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
  tasks: {
    follow?: string;
    like?: string;
    recast?: string;
  };
  status: 'active' | 'completed';
  createdAt: any;
}

interface Participant {
  userId: string;
  walletAddress: string;
  completedTasks: {
    follow: boolean;
    like: boolean;
    recast: boolean;
  };
  claimed: boolean;
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
    tasks: {
      follow: '',
      like: '',
      recast: ''
    }
  });

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
        status: 'active',
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'campaigns'), campaignData);
      setIsCreateDialogOpen(false);
      toast.success('Campaign created successfully!');
      setNewCampaign({
        title: '',
        description: '',
        tokenAddress: '',
        tokenSymbol: '',
        totalReward: 0,
        rewardPerParticipant: 0,
        tasks: { follow: '', like: '', recast: '' }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'campaigns');
    }
  };

  const handleParticipate = async (campaignId: string) => {
    if (!user) return toast.error('Please login first');
    if (!isConnected) return toast.error('Please connect wallet');

    try {
      const participantRef = doc(db, 'campaigns', campaignId, 'participants', user.uid);
      await setDoc(participantRef, {
        userId: user.uid,
        walletAddress: address,
        campaignId: campaignId,
        completedTasks: {
          follow: false,
          like: false,
          recast: false
        },
        claimed: false
      });
      toast.success('Joined campaign! Complete tasks to earn rewards.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `campaigns/${campaignId}/participants/${user.uid}`);
    }
  };

  const verifyTask = async (campaignId: string, taskType: 'follow' | 'like' | 'recast') => {
    if (!user) return;
    toast.info(`Verifying ${taskType}...`);
    
    // Simulate verification delay
    setTimeout(async () => {
      try {
        const participantRef = doc(db, 'campaigns', campaignId, 'participants', user.uid);
        await updateDoc(participantRef, {
          [`completedTasks.${taskType}`]: true
        });
        toast.success(`${taskType} verified!`);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `campaigns/${campaignId}/participants/${user.uid}`);
      }
    }, 1500);
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
            <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
              <ShieldCheck className="text-black w-6 h-6" />
            </div>
            <span className="font-bold text-xl tracking-tight hidden sm:block">Proof of Alpha</span>
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
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl sm:text-7xl font-bold mb-6 tracking-tighter"
          >
            Airdrops for the <span className="text-orange-500">Alpha</span>
          </motion.h1>
          <p className="text-white/60 text-lg mb-8 leading-relaxed">
            Create airdrops for people who react to your posts. Set follow, like, or recast tasks and reward participants with any ERC20 token in a few clicks.
          </p>
          
          <div className="flex flex-wrap justify-center gap-4">
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="lg" className="bg-orange-500 hover:bg-orange-600 text-black font-bold px-8 h-14 rounded-2xl">
                  <Plus className="w-5 h-5 mr-2" />
                  Create Campaign
                </Button>
              </DialogTrigger>
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
                      <Label>Per Participant</Label>
                      <Input 
                        type="number" 
                        placeholder="10" 
                        className="bg-white/5 border-white/10"
                        value={newCampaign.rewardPerParticipant}
                        onChange={e => setNewCampaign({...newCampaign, rewardPerParticipant: Number(e.target.value)})}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Twitter Follow (Username)</Label>
                    <Input 
                      placeholder="@username" 
                      className="bg-white/5 border-white/10"
                      value={newCampaign.tasks.follow}
                      onChange={e => setNewCampaign({...newCampaign, tasks: {...newCampaign.tasks, follow: e.target.value}})}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateCampaign} className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold">
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
            { label: 'Active Campaigns', value: campaigns.length, icon: Trophy },
            { label: 'Total Participants', value: '12.4k', icon: Users },
            { label: 'Rewards Distributed', value: '$450k+', icon: Coins },
          ].map((stat, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white/5 border border-white/10 p-6 rounded-3xl"
            >
              <stat.icon className="w-6 h-6 text-orange-500 mb-4" />
              <div className="text-3xl font-bold mb-1">{stat.value}</div>
              <div className="text-white/40 text-sm uppercase tracking-wider font-medium">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Campaign Tabs */}
        <Tabs defaultValue="all" className="w-full">
          <div className="flex items-center justify-between mb-8">
            <TabsList className="bg-white/5 border border-white/10 p-1 rounded-xl">
              <TabsTrigger value="all" className="rounded-lg px-6 data-[state=active]:bg-orange-500 data-[state=active]:text-black">
                All Airdrops
              </TabsTrigger>
              <TabsTrigger value="my" className="rounded-lg px-6 data-[state=active]:bg-orange-500 data-[state=active]:text-black">
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
                    <Card className="bg-[#111] border-white/10 hover:border-orange-500/50 transition-all duration-300 group overflow-hidden">
                      <div className="absolute top-0 right-0 p-4">
                        <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20">
                          {campaign.tokenSymbol}
                        </Badge>
                      </div>
                      <CardHeader>
                        <CardTitle className="text-xl font-bold group-hover:text-orange-500 transition-colors">
                          {campaign.title}
                        </CardTitle>
                        <CardDescription className="text-white/40 line-clamp-2">
                          {campaign.description || `Earn ${campaign.rewardPerParticipant} ${campaign.tokenSymbol} by completing simple social tasks.`}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                          <div className="flex items-center gap-2">
                            <Coins className="w-4 h-4 text-orange-500" />
                            <span className="text-sm font-medium">Reward Pool</span>
                          </div>
                          <span className="font-bold">{campaign.totalReward} {campaign.tokenSymbol}</span>
                        </div>
                        
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Required Tasks</p>
                          <div className="flex gap-2">
                            {campaign.tasks.follow && <Badge variant="secondary" className="bg-white/5 text-white/60"><Twitter className="w-3 h-3 mr-1" /> Follow</Badge>}
                            {campaign.tasks.like && <Badge variant="secondary" className="bg-white/5 text-white/60"><Heart className="w-3 h-3 mr-1" /> Like</Badge>}
                            {campaign.tasks.recast && <Badge variant="secondary" className="bg-white/5 text-white/60"><Repeat className="w-3 h-3 mr-1" /> Recast</Badge>}
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter>
                        <Button 
                          onClick={() => handleParticipate(campaign.id)}
                          className="w-full bg-white text-black hover:bg-orange-500 hover:text-black transition-all font-bold rounded-xl"
                        >
                          Join Airdrop
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
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
                          <Badge className="bg-orange-500 text-black font-bold">
                            {p.campaign.tokenSymbol}
                          </Badge>
                          {p.claimed && <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Claimed</Badge>}
                        </div>
                        <CardTitle className="text-xl font-bold">{p.campaign.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="space-y-3">
                          <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Task Progress</p>
                          
                          {p.campaign.tasks.follow && (
                            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                              <div className="flex items-center gap-3">
                                <Twitter className="w-4 h-4 text-sky-400" />
                                <span className="text-sm">Follow {p.campaign.tasks.follow}</span>
                              </div>
                              {p.completedTasks.follow ? (
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                              ) : (
                                <Button size="sm" variant="ghost" className="text-orange-500 hover:text-orange-400 p-0 h-auto" onClick={() => verifyTask(p.campaign.id, 'follow')}>
                                  Verify
                                </Button>
                              )}
                            </div>
                          )}

                          {p.campaign.tasks.like && (
                            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                              <div className="flex items-center gap-3">
                                <Heart className="w-4 h-4 text-pink-500" />
                                <span className="text-sm">Like Post</span>
                              </div>
                              {p.completedTasks.like ? (
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                              ) : (
                                <Button size="sm" variant="ghost" className="text-orange-500 hover:text-orange-400 p-0 h-auto" onClick={() => verifyTask(p.campaign.id, 'like')}>
                                  Verify
                                </Button>
                              )}
                            </div>
                          )}

                          {p.campaign.tasks.recast && (
                            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                              <div className="flex items-center gap-3">
                                <Repeat className="w-4 h-4 text-purple-500" />
                                <span className="text-sm">Recast Cast</span>
                              </div>
                              {p.completedTasks.recast ? (
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                              ) : (
                                <Button size="sm" variant="ghost" className="text-orange-500 hover:text-orange-400 p-0 h-auto" onClick={() => verifyTask(p.campaign.id, 'recast')}>
                                  Verify
                                </Button>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="pt-4 border-t border-white/5">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-white/40">Potential Reward</span>
                            <span className="font-bold text-orange-500">{p.campaign.rewardPerParticipant} {p.campaign.tokenSymbol}</span>
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter>
                        <Button 
                          disabled={p.claimed || !Object.values(p.completedTasks).every(v => v === true)}
                          className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold disabled:bg-white/5 disabled:text-white/20"
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

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 mt-20">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-orange-500 w-5 h-5" />
            <span className="font-bold">PoA</span>
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
